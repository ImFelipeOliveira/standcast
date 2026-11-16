import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { DailyConfirmation } from '@standcast/core';
import { listMemberInstallations, type MemberRow } from '@standcast/db';
import {
  cancelAway,
  createMembershipCheck,
  type Deps,
  DomainError,
  decideDraftSuggestion,
  endSession,
  getDraft,
  getToday,
  listAway,
  markAway,
  startSession,
  submitDaily,
} from '@standcast/orchestrator';
import { HTTPException } from 'hono/http-exception';
import { onError } from '../http/errors';
import {
  type GetClientIp,
  IP_LIMIT,
  ipRateLimit,
  SESSION_START_LIMIT,
  subjectRateLimit,
} from '../middleware/rate-limit';
import { bearerToken, type SessionEnv, sessionAuth } from '../middleware/session-auth';
import { sessionScheme } from '../openapi/document';
import {
  AwayCancelSchema,
  AwayListSchema,
  AwayMarkSchema,
  AwayPeriodSchema,
  DAILY_EXAMPLE,
  DailySubmissionSchema,
  DRAFT_EXAMPLE,
  DraftSchema,
  errorResponse,
  MetaSchema,
  RATE_LIMITED,
  rateHeaders,
  SESSION_EXAMPLE,
  SessionRequestSchema,
  SessionSchema,
  SubmitResultSchema,
  SuggestionDecisionSchema,
  TodaySchema,
} from '../openapi/schemas';
import { manageRoutes } from './manage';

type Env = SessionEnv;

export type V1Options = { getClientIp: GetClientIp };

const UNAUTHORIZED = errorResponse('Missing, invalid or expired session.', {
  unauthorized: 'missing or invalid session',
});
const ORG_ERRORS = {
  404: errorResponse('The organization was not found.', {
    org_not_found: 'organization not found',
  }),
  409: errorResponse('The organization is not ready to use.', {
    org_not_configured: 'organization has no valid standcast.yml',
    installation_pending: 'installation is still being processed',
  }),
};

const meta = createRoute({
  method: 'get',
  path: '/v1/meta',
  tags: ['Meta'],
  summary: 'Public client metadata',
  description:
    'Returns the GitHub OAuth client id and the support email, so the CLI can start a login.\n\nRetorna o client id do OAuth do GitHub e o e-mail de suporte, para a CLI iniciar o login.',
  responses: {
    200: {
      description: 'Client metadata.',
      content: {
        'application/json': {
          schema: MetaSchema,
          example: {
            githubClientId: 'Iv1.0123456789abcdef',
            supportEmail: 'support@standcast.app',
          },
        },
      },
    },
  },
});

const sessions = createRoute({
  method: 'post',
  path: '/v1/sessions',
  tags: ['Session'],
  summary: 'Start a CLI session',
  description:
    'Exchanges a GitHub user token for a Standcast session token (`sc_`). Limited to 10 requests per minute per IP address.\n\nTroca um token de usuário do GitHub por um token de sessão do Standcast (`sc_`). Limitado a 10 requisições por minuto por IP.',
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: SessionRequestSchema,
          example: { githubToken: 'gho_16C7e42F292c6912E7710c838347Ae178B4a' },
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Session created.',
      headers: rateHeaders,
      content: { 'application/json': { schema: SessionSchema, example: SESSION_EXAMPLE } },
    },
    401: errorResponse('The GitHub token is invalid or expired.', {
      unauthorized: 'GitHub token invalid or expired',
    }),
    422: errorResponse('The body is not valid.', { invalid_request: 'githubToken is required' }),
    429: RATE_LIMITED,
  },
});

const endCurrentSession = createRoute({
  method: 'delete',
  path: '/v1/sessions/current',
  tags: ['Session'],
  summary: 'End the current CLI session',
  description:
    'Revokes the session token used in the request, so it stops working immediately.\n\nRevoga o token de sessão usado na requisição, que deixa de funcionar imediatamente.',
  security: [{ session: [] }],
  responses: {
    204: { description: 'The session was revoked.', headers: rateHeaders },
    401: UNAUTHORIZED,
    429: RATE_LIMITED,
  },
});

const orgQuery = z.object({
  org: z.string().min(1).openapi({
    description: 'Login of the organization.',
    example: 'acme',
  }),
});

const requireOrg = (result: { success: boolean }): undefined => {
  if (!result.success) throw new DomainError('invalid_request', 'org is required');
};

const draft = createRoute({
  method: 'get',
  path: '/v1/draft',
  tags: ['Daily'],
  summary: 'Get the draft for today',
  description:
    "Builds the draft of yesterday's work from the person's GitHub activity. `org` is required.\n\nMonta o rascunho do que a pessoa fez ontem a partir da atividade no GitHub. `org` é obrigatório.",
  security: [{ session: [] }],
  request: { query: orgQuery },
  responses: {
    200: {
      description: 'The draft.',
      headers: rateHeaders,
      content: { 'application/json': { schema: DraftSchema, example: DRAFT_EXAMPLE } },
    },
    401: UNAUTHORIZED,
    403: errorResponse('The person has no access to the organization.', {
      forbidden: 'not a member of this organization',
    }),
    404: ORG_ERRORS[404],
    409: ORG_ERRORS[409],
    422: errorResponse('The request or the person is not valid for this organization.', {
      invalid_request: 'org is required',
      not_in_team: 'you are not in any team of this organization',
    }),
    429: RATE_LIMITED,
  },
});

const today = createRoute({
  method: 'get',
  path: '/v1/today',
  tags: ['Daily'],
  summary: 'Get the standup date',
  description:
    "Returns the date the next daily counts for and the person's teams, without building the draft. Used by the MCP server to show the date before asking for confirmation. `org` is required.\n\nRetorna a data em que a próxima daily conta e os times da pessoa, sem montar o rascunho. Usado pelo servidor MCP para mostrar a data antes de pedir a confirmação. `org` é obrigatório.",
  security: [{ session: [] }],
  request: { query: orgQuery },
  responses: {
    200: {
      description: 'The standup date.',
      headers: rateHeaders,
      content: {
        'application/json': {
          schema: TodaySchema,
          example: { org: 'acme', date: '2026-10-28', teams: ['Alpha'] },
        },
      },
    },
    401: UNAUTHORIZED,
    403: errorResponse('The person has no access to the organization.', {
      forbidden: 'not a member of this organization',
    }),
    404: ORG_ERRORS[404],
    409: ORG_ERRORS[409],
    422: errorResponse('The request or the person is not valid for this organization.', {
      invalid_request: 'org is required',
      not_in_team: 'you are not in any team of this organization',
    }),
    429: RATE_LIMITED,
  },
});

const dailies = createRoute({
  method: 'post',
  path: '/v1/dailies',
  tags: ['Daily'],
  summary: 'Submit the daily',
  description:
    'Submits the confirmed daily. Sending again on the same day replaces the previous one. If the digest was already posted, the daily is posted as a thread reply. The optional `X-Standcast-Confirmation` header (`human` or `agent`) records who confirmed it; other values are ignored. It is self-reported by the client and informational only, not a security control.\n\nEnvia a daily confirmada. Reenviar no mesmo dia substitui a anterior. Se o consolidado já foi publicado, a daily vai como resposta na thread. O cabeçalho opcional `X-Standcast-Confirmation` (`human` ou `agent`) registra quem confirmou; outros valores são ignorados. Ele é informado pelo próprio cliente e serve só como informação, não como controle de segurança.',
  security: [{ session: [] }],
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: DailySubmissionSchema,
          example: DAILY_EXAMPLE,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'The daily was stored.',
      headers: rateHeaders,
      content: {
        'application/json': {
          schema: SubmitResultSchema,
          example: { date: '2026-10-28', teams: ['Alpha'], late: false },
        },
      },
    },
    401: UNAUTHORIZED,
    403: errorResponse('The person has no access to the organization.', {
      forbidden: 'not a member of this organization',
    }),
    404: ORG_ERRORS[404],
    409: ORG_ERRORS[409],
    422: errorResponse('The daily is not valid, or the person is in no team.', {
      invalid_daily: 'invalid daily',
      not_in_team: 'you are not in any team of this organization',
    }),
    429: RATE_LIMITED,
  },
});

const suggestionDecision = createRoute({
  method: 'post',
  path: '/v1/suggestions/{id}/decision',
  tags: ['Daily'],
  summary: 'Confirm or ignore a suggested blocker',
  description:
    "Records the person's answer to one of the suggested blockers listed in their own draft. `confirmed` marks it as a real blocker; `ignored` hides it until the signal changes. Repeating the same decision is a no-op. Only the owner of the suggestion can decide it.\n\nRegistra a resposta da pessoa a uma das sugestões de impedimento listadas no próprio rascunho. `confirmed` marca como impedimento real; `ignored` esconde até o sinal mudar. Repetir a mesma decisão não muda nada. Só a dona da sugestão pode decidir.",
  security: [{ session: [] }],
  request: {
    params: z.object({
      id: z.string().openapi({
        format: 'uuid',
        description: 'Suggestion id from the draft.',
        example: '5f0c2a8e-3b1d-4c7e-9a2f-1d6b8e4c0a17',
      }),
    }),
    body: {
      required: true,
      content: {
        'application/json': {
          schema: SuggestionDecisionSchema,
          example: { org: 'acme', decision: 'ignored' },
        },
      },
    },
  },
  responses: {
    204: { description: 'The decision was recorded.', headers: rateHeaders },
    401: UNAUTHORIZED,
    403: errorResponse('The person has no access to the organization.', {
      forbidden: 'not a member of this organization',
    }),
    404: errorResponse('The organization or the suggestion was not found.', {
      org_not_found: 'organization not found',
      not_found: 'suggestion not found',
    }),
    409: errorResponse('The organization is not ready, or the suggestion was decided otherwise.', {
      org_not_configured: 'organization has no valid standcast.yml',
      suggestion_already_decided: 'suggestion was already decided',
    }),
    422: errorResponse('The request is not valid.', {
      invalid_request: 'org and decision are required',
      not_in_team: 'you are not in any team of this organization',
    }),
    429: RATE_LIMITED,
  },
});

const AWAY_EXAMPLE = {
  id: '5f0c2a8e-3b1d-4c7e-9a2f-1d6b8e4c0a17',
  login: 'alice',
  from: '2026-10-28',
  until: '2026-10-30',
  markedBy: 'alice',
  markedAt: '2026-10-28T15:00:00.000Z',
  mine: true,
};

const AWAY_ACCESS_ERRORS = {
  401: UNAUTHORIZED,
  403: errorResponse('The person has no access to the organization.', {
    forbidden: 'not a member of this organization',
  }),
  404: errorResponse('The organization was not found.', {
    org_not_found: 'organization not found',
  }),
  429: RATE_LIMITED,
};

const awayList = createRoute({
  method: 'get',
  path: '/v1/away',
  tags: ['Away'],
  summary: 'List my away periods',
  description:
    "Lists the caller's own current and upcoming away periods in the organization. While a person is away, they are not reminded and are not listed as missing in the digest.\n\nLista os períodos de ausência atuais e futuros da própria pessoa na organização. Enquanto está ausente, a pessoa não recebe lembrete e não aparece como pendente no consolidado.",
  security: [{ session: [] }],
  request: { query: orgQuery },
  responses: {
    200: {
      description: 'The away periods.',
      headers: rateHeaders,
      content: {
        'application/json': { schema: AwayListSchema, example: { data: [AWAY_EXAMPLE] } },
      },
    },
    ...AWAY_ACCESS_ERRORS,
    422: errorResponse('The request is not valid.', { invalid_request: 'org is required' }),
  },
});

const awayMark = createRoute({
  method: 'post',
  path: '/v1/away',
  tags: ['Away'],
  summary: 'Mark myself away',
  description:
    'Marks the caller as away from `from` (default today) to `until`, both inclusive and at most 90 days long. It cannot overlap another active period. A notice is posted to the team chat. Marking someone else is only available in the web app.\n\nMarca a pessoa como ausente de `from` (padrão hoje) até `until`, ambos inclusive e com no máximo 90 dias. Não pode sobrepor outro período ativo. Um aviso é publicado no chat do time. Marcar outra pessoa só é possível no app web.',
  security: [{ session: [] }],
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: AwayMarkSchema,
          example: { org: 'acme', until: '2026-10-30' },
        },
      },
    },
  },
  responses: {
    201: {
      description: 'The period was created.',
      headers: rateHeaders,
      content: { 'application/json': { schema: AwayPeriodSchema, example: AWAY_EXAMPLE } },
    },
    ...AWAY_ACCESS_ERRORS,
    422: errorResponse('The request or the period is not valid.', {
      invalid_request: 'org and until are required',
      invalid_away_period: 'the period is not valid',
      away_overlap: 'the period overlaps another one',
      not_in_team: 'you are not in any team of this organization',
    }),
  },
});

const awayCancel = createRoute({
  method: 'post',
  path: '/v1/away/{periodId}/cancel',
  tags: ['Away'],
  summary: 'Cancel an away period',
  description:
    "Cancels one of the caller's own away periods. A notice is posted to the team chat.\n\nCancela um período de ausência da própria pessoa. Um aviso é publicado no chat do time.",
  security: [{ session: [] }],
  request: {
    params: z.object({
      periodId: z.string().openapi({
        format: 'uuid',
        description: 'Away period id.',
        example: AWAY_EXAMPLE.id,
      }),
    }),
    body: {
      required: true,
      content: {
        'application/json': { schema: AwayCancelSchema, example: { org: 'acme' } },
      },
    },
  },
  responses: {
    204: { description: 'The period was cancelled.', headers: rateHeaders },
    ...AWAY_ACCESS_ERRORS,
    404: errorResponse('The organization or the period was not found.', {
      org_not_found: 'organization not found',
      not_found: 'away period not found',
    }),
    422: errorResponse('The request is not valid.', { invalid_request: 'org is required' }),
  },
});

const CONFIRMATION_HEADER = 'x-standcast-confirmation';

function confirmationOf(value: string | undefined): DailyConfirmation | undefined {
  return value === 'agent' || value === 'human' ? value : undefined;
}

const BODY_ERRORS: Record<string, DomainError> = {
  '/v1/sessions': new DomainError('invalid_request', 'request body must be JSON'),
  '/v1/dailies': new DomainError('invalid_daily', 'request body must be JSON'),
};

const SUGGESTION_DECISION_PATH = /^\/v1\/suggestions\/[^/]+\/decision$/;
const AWAY_BODY_PATH = /^\/v1\/away(\/[^/]+\/cancel)?$/;

function bodyError(error: Error, path: string): Error {
  const mapped =
    BODY_ERRORS[path] ??
    (SUGGESTION_DECISION_PATH.test(path) || AWAY_BODY_PATH.test(path)
      ? new DomainError('invalid_request', 'request body must be JSON')
      : undefined);
  if (error instanceof HTTPException && (error.status === 400 || error.status === 415) && mapped) {
    return new DomainError(mapped.code, mapped.message);
  }
  return error;
}

async function installationOf(deps: Deps, member: MemberRow, org: string): Promise<number> {
  const wanted = org.toLowerCase();
  const entry = (await listMemberInstallations(deps.db, member.id)).find(
    (i) => i.accountLogin.toLowerCase() === wanted,
  );
  if (!entry) throw new DomainError('org_not_found', `organization ${org} not found`);
  return entry.installationId;
}

const invalidOrg =
  (message: string) =>
  (result: { success: boolean; error?: z.ZodError }): undefined => {
    if (!result.success) throw new DomainError('invalid_request', message, result.error?.issues);
  };

export function v1Routes(deps: Deps, options: V1Options): OpenAPIHono<Env> {
  const app = new OpenAPIHono<Env>();
  const isMember = createMembershipCheck(deps);
  app.openAPIRegistry.registerComponent('securitySchemes', 'session', sessionScheme());

  app.use('/v1/*', ipRateLimit(deps, options.getClientIp, 'api', IP_LIMIT));
  app.use('/v1/sessions', ipRateLimit(deps, options.getClientIp, 'sessions', SESSION_START_LIMIT));
  for (const path of [
    '/v1/sessions/current',
    '/v1/draft',
    '/v1/today',
    '/v1/dailies',
    '/v1/suggestions/*',
    '/v1/away',
    '/v1/away/*',
    '/v1/manage/*',
  ]) {
    app.use(path, sessionAuth(deps, options.getClientIp), subjectRateLimit(deps));
  }

  app.onError((error, c) => onError(bodyError(error, c.req.path), c));

  app.openapi(meta, (c) =>
    c.json({ githubClientId: deps.env.githubClientId, supportEmail: deps.env.supportEmail }, 200),
  );

  app.openapi(
    sessions,
    async (c) => c.json(await startSession(deps, c.req.valid('json')), 200),
    (result) => {
      if (!result.success) {
        throw new DomainError('invalid_request', 'githubToken is required', result.error.issues);
      }
    },
  );

  app.openapi(endCurrentSession, async (c) => {
    await endSession(deps, bearerToken(c.req.header('authorization')));
    return c.body(null, 204);
  });

  app.openapi(
    draft,
    async (c) =>
      c.json(await getDraft(deps, isMember, c.get('member'), c.req.valid('query').org), 200),
    requireOrg,
  );

  app.openapi(
    today,
    async (c) =>
      c.json(await getToday(deps, isMember, c.get('member'), c.req.valid('query').org), 200),
    requireOrg,
  );

  app.openapi(
    dailies,
    async (c) =>
      c.json(
        await submitDaily(deps, isMember, c.get('member'), c.req.valid('json'), {
          confirmation: confirmationOf(c.req.header(CONFIRMATION_HEADER)),
        }),
        200,
      ),
    (result) => {
      if (!result.success) {
        throw new DomainError('invalid_daily', 'invalid daily', result.error.issues);
      }
    },
  );

  app.openapi(
    suggestionDecision,
    async (c) => {
      const { org, decision } = c.req.valid('json');
      await decideDraftSuggestion(
        deps,
        isMember,
        c.get('member'),
        org,
        c.req.valid('param').id,
        decision,
      );
      return c.body(null, 204);
    },
    (result) => {
      if (!result.success) {
        throw new DomainError(
          'invalid_request',
          'org and decision are required',
          result.error.issues,
        );
      }
    },
  );

  app.openapi(
    awayList,
    async (c) => {
      const member = c.get('member');
      const installationId = await installationOf(deps, member, c.req.valid('query').org);
      return c.json({ data: await listAway(deps, isMember, member, { installationId }) }, 200);
    },
    requireOrg,
  );

  app.openapi(
    awayMark,
    async (c) => {
      const member = c.get('member');
      const { org, from, until } = c.req.valid('json');
      const installationId = await installationOf(deps, member, org);
      const period = await markAway(deps, isMember, member, { installationId, from, until });
      return c.json(period, 201);
    },
    invalidOrg('org and until are required, and login is not accepted'),
  );

  app.openapi(
    awayCancel,
    async (c) => {
      const member = c.get('member');
      const installationId = await installationOf(deps, member, c.req.valid('json').org);
      await cancelAway(deps, isMember, member, {
        installationId,
        periodId: c.req.valid('param').periodId,
      });
      return c.body(null, 204);
    },
    invalidOrg('org is required'),
  );

  app.route('/', manageRoutes(deps, isMember));

  return app;
}
