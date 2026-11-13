import { describe, expect, test } from 'bun:test';
import { parseConfig } from '@standcast/core';
import {
  createSession,
  getBlockerState,
  type MemberRow,
  setInstallationConfig,
  setMemberInstallations,
  upsertDaily,
  upsertInstallation,
  upsertMember,
} from '@standcast/db';
import { csrfToken, recordBlockers } from '@standcast/orchestrator';
import { db, useCleanDb } from '../../../packages/db/test/setup';
import { createTestApp, type FakeRequest } from './support';

useCleanDb();

const APP = 'https://app.test';
const INST = 11;

function config() {
  const parsed = parseConfig(`
teams:
  - name: Alpha
    timezone: America/Sao_Paulo
    remind_at: "09:00"
    digest_at: "10:00"
    managers: [alice]
    members: [alice, bob]
    chat: { provider: slack, channel: "#alpha" }
  - name: Beta
    timezone: America/Sao_Paulo
    remind_at: "09:00"
    digest_at: "10:00"
    managers: [carol]
    members: [carol]
    chat: { provider: slack, channel: "#beta" }
`);
  if (!parsed.ok) throw new Error('config');
  return parsed.config;
}

async function useConfig(yml: string) {
  const parsed = parseConfig(yml);
  if (!parsed.ok) throw new Error('config');
  await setInstallationConfig(db, INST, { status: 'configured', config: parsed.config });
}

type User = { cookie: string; csrf: string; member: MemberRow };

async function harness(admins: string[] = []) {
  const users = new Map([
    [1, 'alice'],
    [2, 'bob'],
    [3, 'carol'],
  ]);
  const request: FakeRequest = async (route, params) => {
    if (route === 'GET /user/{account_id}') {
      return { status: 200, data: { login: users.get(Number(params.account_id)) } };
    }
    if (route === 'GET /orgs/{org}/members/{username}' && params.org === 'acme') {
      return { status: 204 };
    }
    if (route === 'GET /orgs/{org}/memberships/{username}' && params.org === 'acme') {
      const role = admins.includes(String(params.username)) ? 'admin' : 'member';
      return { status: 200, data: { role, state: 'active' } };
    }
    throw Object.assign(new Error('not found'), { status: 404 });
  };
  const { app, deps, queue, setNow } = createTestApp({ request });
  setNow(new Date('2026-10-28T12:00:00Z'));
  await upsertInstallation(db, { id: INST, accountLogin: 'acme', accountType: 'Organization' });
  await setInstallationConfig(db, INST, { status: 'configured', config: config() });
  const session = async (githubUserId: number): Promise<User> => {
    const login = users.get(githubUserId) ?? '';
    const member = await upsertMember(db, { githubUserId, login, email: null });
    await setMemberInstallations(db, member.id, [INST]);
    const token = await createSession(db, member.id, 'web');
    return { cookie: `sc_web=${token}`, csrf: csrfToken('sess', token), member };
  };
  const alice = await session(1);
  const bob = await session(2);
  const carol = await session(3);
  await upsertDaily(db, {
    installationId: INST,
    memberId: bob.member.id,
    date: '2026-10-28',
    payload: {
      org: 'acme',
      yesterday: [],
      today: [{ text: 'ship it' }],
      blockers: [{ text: 'need prod access' }],
      support: [],
    },
    submittedAt: new Date('2026-10-28T11:50:00Z'),
  });
  await recordBlockers(deps, {
    installationId: INST,
    memberId: bob.member.id,
    date: '2026-10-28',
    blockers: [{ text: 'need prod access' }],
  });
  const [state] = await db.query.blockerStates.findMany();
  return { app, deps, queue, alice, bob, carol, blockerId: state?.id ?? '' };
}

type App = Awaited<ReturnType<typeof harness>>['app'];

const get = (app: App, user: User, path: string) =>
  app.request(`/v1/app/orgs/${path}`, { headers: { cookie: user.cookie, origin: APP } });

const post = (app: App, user: User, path: string) =>
  app.request(`/v1/app/orgs/${path}`, {
    method: 'POST',
    headers: { cookie: user.cookie, origin: APP, 'x-standcast-csrf': user.csrf },
  });

describe('/v1/app today', () => {
  test('today is 200 for a member, 403 for others and 404 for unknown teams', async () => {
    const { app, bob, carol, blockerId } = await harness();
    const ok = await get(app, bob, `${INST}/teams/Alpha/today`);
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.date).toBe('2026-10-28');
    expect(body.people.map((p: { login: string; status: string }) => [p.login, p.status])).toEqual([
      ['alice', 'missing'],
      ['bob', 'sent'],
    ]);
    expect(body.blockers.map((b: { id: string }) => b.id)).toEqual([blockerId]);
    expect((await get(app, carol, `${INST}/teams/Alpha/today`)).status).toBe(403);
    const missing = await get(app, bob, `${INST}/teams/Nope/today`);
    expect(missing.status).toBe(404);
    expect((await missing.json()).error.code).toBe('not_found');
    expect((await get(app, bob, `12/teams/Alpha/today`)).status).toBe(403);
  });

  test('teams summary counts today per readable team', async () => {
    const { app, bob, carol } = await harness();
    const res = await get(app, bob, `${INST}/teams/summary`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ team: 'Alpha', sent: 1, total: 2 }]);
    expect(await (await get(app, carol, `${INST}/teams/summary`)).json()).toEqual([
      { team: 'Beta', sent: 0, total: 1 },
    ]);
    expect((await get(app, bob, `12/teams/summary`)).status).toBe(403);
  });

  test('resolve and reopen are 204 for the author, 403 for others', async () => {
    const { app, bob, carol, blockerId } = await harness();
    expect((await post(app, carol, `${INST}/blockers/${blockerId}/resolve`)).status).toBe(403);
    expect((await post(app, bob, `${INST}/blockers/${blockerId}/resolve`)).status).toBe(204);
    expect((await getBlockerState(db, INST, blockerId))?.resolvedAt).not.toBeNull();
    expect((await post(app, bob, `${INST}/blockers/${blockerId}/reopen`)).status).toBe(204);
    expect((await getBlockerState(db, INST, blockerId))?.resolvedAt).toBeNull();
    const unknown = await post(
      app,
      bob,
      `${INST}/blockers/00000000-0000-4000-8000-000000000000/resolve`,
    );
    expect(unknown.status).toBe(404);
  });

  test('remind is 202 for a manager and 403 for a member', async () => {
    const { app, queue, alice, bob } = await harness();
    const res = await post(app, alice, `${INST}/teams/Alpha/remind/alice`);
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ result: 'queued' });
    expect(queue.enqueued.filter((j) => j.name === 'send-reminder')).toEqual([
      {
        name: 'send-reminder',
        data: { installationId: INST, login: 'alice', date: '2026-10-28', team: 'Alpha' },
      },
    ]);
    const sent = await post(app, alice, `${INST}/teams/Alpha/remind/bob`);
    expect(await sent.json()).toEqual({ result: 'already_sent' });
    expect((await post(app, bob, `${INST}/teams/Alpha/remind/alice`)).status).toBe(403);
  });

  test('writes need the csrf token', async () => {
    const { app, alice, blockerId } = await harness();
    const res = await app.request(`/v1/app/orgs/${INST}/blockers/${blockerId}/resolve`, {
      method: 'POST',
      headers: { cookie: alice.cookie, origin: APP },
    });
    expect(res.status).toBe(403);
  });
});

describe('/v1/app blockers', () => {
  test('lists open blockers of readable teams with who can resolve them', async () => {
    const { app, alice, bob, carol, blockerId } = await harness();
    const asBob = await (await get(app, bob, `${INST}/blockers`)).json();
    expect(asBob.open).toHaveLength(1);
    expect(asBob.open[0]).toMatchObject({
      id: blockerId,
      author: 'bob',
      text: 'need prod access',
      teams: ['Alpha'],
      canResolve: true,
    });
    expect(asBob.resolved).toEqual([]);
    const asAlice = await (await get(app, alice, `${INST}/blockers`)).json();
    expect(asAlice.open[0].canResolve).toBe(true);
    const asCarol = await (await get(app, carol, `${INST}/blockers`)).json();
    expect(asCarol.open).toEqual([]);
  });

  test('a blocker shared by two readable teams shows once with both teams', async () => {
    const { app, bob, blockerId } = await harness();
    const shared = parseConfig(`
teams:
  - name: Alpha
    timezone: America/Sao_Paulo
    remind_at: "09:00"
    digest_at: "10:00"
    managers: [alice]
    members: [alice, bob]
    chat: { provider: slack, channel: "#alpha" }
  - name: Beta
    timezone: America/Sao_Paulo
    remind_at: "09:00"
    digest_at: "10:00"
    managers: [carol]
    members: [carol, bob]
    chat: { provider: slack, channel: "#beta" }
`);
    if (!shared.ok) throw new Error('config');
    await setInstallationConfig(db, INST, { status: 'configured', config: shared.config });
    const body = await (await get(app, bob, `${INST}/blockers`)).json();
    expect(body.open.map((b: { id: string; teams: string[] }) => [b.id, b.teams])).toEqual([
      [blockerId, ['Alpha', 'Beta']],
    ]);
  });

  test('the team filter narrows the list, rejects unknown and unreadable teams', async () => {
    const { app, alice, carol } = await harness();
    expect((await (await get(app, alice, `${INST}/blockers?team=Alpha`)).json()).open).toHaveLength(
      1,
    );
    expect((await get(app, alice, `${INST}/blockers?team=Nope`)).status).toBe(404);
    expect((await get(app, carol, `${INST}/blockers?team=Alpha`)).status).toBe(403);
    expect((await get(app, alice, `12/blockers`)).status).toBe(403);
  });

  test('resolved blockers move to the resolved list with who resolved them', async () => {
    const { app, alice, bob, blockerId } = await harness();
    expect((await post(app, bob, `${INST}/blockers/${blockerId}/resolve`)).status).toBe(204);
    const body = await (await get(app, alice, `${INST}/blockers`)).json();
    expect(body.open).toEqual([]);
    expect(body.resolved).toEqual([
      {
        id: blockerId,
        teams: ['Alpha'],
        author: 'bob',
        text: 'need prod access',
        ref: null,
        resolvedOn: '2026-10-28',
        resolvedBy: 'bob',
        canResolve: true,
      },
    ]);
  });
});

describe('/v1/app blockers permissions', () => {
  async function aliceBlocker(deps: Parameters<typeof recordBlockers>[0], alice: User) {
    await upsertDaily(db, {
      installationId: INST,
      memberId: alice.member.id,
      date: '2026-10-28',
      payload: {
        org: 'acme',
        yesterday: [],
        today: [],
        blockers: [{ text: 'waiting on legal' }],
        support: [],
      },
      submittedAt: new Date('2026-10-28T11:55:00Z'),
    });
    await recordBlockers(deps, {
      installationId: INST,
      memberId: alice.member.id,
      date: '2026-10-28',
      blockers: [{ text: 'waiting on legal' }],
    });
  }

  test('a member who reads the team cannot resolve a teammate blocker', async () => {
    const { app, deps, alice, bob } = await harness();
    await aliceBlocker(deps, alice);
    const body = await (await get(app, bob, `${INST}/blockers`)).json();
    const legal = body.open.find((b: { text: string }) => b.text === 'waiting on legal');
    expect(legal.canResolve).toBe(false);
  });

  test('an org admin who is only a member of the team can resolve', async () => {
    const { app, deps, alice, bob } = await harness(['bob']);
    await aliceBlocker(deps, alice);
    const body = await (await get(app, bob, `${INST}/blockers?team=Alpha`)).json();
    const legal = body.open.find((b: { text: string }) => b.text === 'waiting on legal');
    expect(legal.canResolve).toBe(true);
  });

  test('resolved blockers say whether the person can reopen them', async () => {
    const { app, alice, bob, carol, blockerId } = await harness();
    await post(app, bob, `${INST}/blockers/${blockerId}/resolve`);
    expect((await (await get(app, alice, `${INST}/blockers`)).json()).resolved[0].canResolve).toBe(
      true,
    );
    expect((await (await get(app, carol, `${INST}/blockers`)).json()).resolved).toEqual([]);
  });

  test('the team filter does not hide a resolve the server allows', async () => {
    const { app, carol, blockerId } = await harness();
    await useConfig(`
teams:
  - name: Alpha
    timezone: America/Sao_Paulo
    remind_at: "09:00"
    digest_at: "10:00"
    managers: [alice]
    members: [alice, bob, carol]
    chat: { provider: slack, channel: "#alpha" }
  - name: Beta
    timezone: America/Sao_Paulo
    remind_at: "09:00"
    digest_at: "10:00"
    managers: [carol]
    members: [carol, bob]
    chat: { provider: slack, channel: "#beta" }
`);
    const filtered = await (await get(app, carol, `${INST}/blockers?team=Alpha`)).json();
    expect(
      filtered.open.map((b: { id: string; canResolve: boolean }) => [b.id, b.canResolve]),
    ).toEqual([[blockerId, true]]);
  });

  test('a resolved blocker the author no longer lists cannot be reopened', async () => {
    const { app, deps, alice, bob, blockerId } = await harness();
    expect((await post(app, bob, `${INST}/blockers/${blockerId}/resolve`)).status).toBe(204);
    await upsertDaily(db, {
      installationId: INST,
      memberId: bob.member.id,
      date: '2026-10-29',
      payload: { org: 'acme', yesterday: [], today: [{ text: 'next' }], blockers: [], support: [] },
      submittedAt: new Date('2026-10-29T11:50:00Z'),
    });
    await recordBlockers(deps, {
      installationId: INST,
      memberId: bob.member.id,
      date: '2026-10-29',
      blockers: [],
    });
    const body = await (await get(app, alice, `${INST}/blockers`)).json();
    expect(
      body.resolved.map((b: { id: string; canResolve: boolean }) => [b.id, b.canResolve]),
    ).toEqual([[blockerId, false]]);
    const reopen = await post(app, bob, `${INST}/blockers/${blockerId}/reopen`);
    expect(reopen.status).toBe(409);
    expect((await reopen.json()).error.code).toBe('blocker_not_current');
    expect((await getBlockerState(db, INST, blockerId))?.resolvedAt).not.toBeNull();
  });
});

describe('/v1/app blockers reopen', () => {
  test('a resolved blocker removed from a resend of the same day cannot be reopened', async () => {
    const { app, deps, alice, bob, blockerId } = await harness();
    expect((await post(app, bob, `${INST}/blockers/${blockerId}/resolve`)).status).toBe(204);
    await upsertDaily(db, {
      installationId: INST,
      memberId: bob.member.id,
      date: '2026-10-28',
      payload: {
        org: 'acme',
        yesterday: [],
        today: [{ text: 'ship it' }],
        blockers: [],
        support: [],
      },
      submittedAt: new Date('2026-10-28T11:58:00Z'),
    });
    await recordBlockers(deps, {
      installationId: INST,
      memberId: bob.member.id,
      date: '2026-10-28',
      blockers: [],
    });
    const body = await (await get(app, alice, `${INST}/blockers`)).json();
    expect(
      body.resolved.map((b: { id: string; canResolve: boolean }) => [b.id, b.canResolve]),
    ).toEqual([[blockerId, false]]);
    const reopen = await post(app, bob, `${INST}/blockers/${blockerId}/reopen`);
    expect(reopen.status).toBe(409);
    expect((await reopen.json()).error.code).toBe('blocker_not_current');
    expect((await getBlockerState(db, INST, blockerId))?.resolvedAt).not.toBeNull();
  });
});

describe('/v1/app blockers calendar', () => {
  test("today follows the author's first configured team, whatever the filter", async () => {
    const { app, alice, blockerId } = await harness();
    await useConfig(`
teams:
  - name: Zeta
    timezone: Pacific/Kiritimati
    remind_at: "09:00"
    digest_at: "10:00"
    managers: [carol]
    members: [bob]
    chat: { provider: slack, channel: "#zeta" }
  - name: Alpha
    timezone: America/Sao_Paulo
    remind_at: "09:00"
    digest_at: "10:00"
    managers: [alice]
    members: [alice, bob]
    chat: { provider: slack, channel: "#alpha" }
`);
    for (const path of [`${INST}/blockers`, `${INST}/blockers?team=Alpha`]) {
      const body = await (await get(app, alice, path)).json();
      expect(
        body.open.map((b: { id: string; timezone: string; today: string }) => [
          b.id,
          b.timezone,
          b.today,
        ]),
        path,
      ).toEqual([[blockerId, 'Pacific/Kiritimati', '2026-10-29']]);
    }
  });
});
