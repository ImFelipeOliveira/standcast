import {
  buildDigest,
  CHAT_PROVIDERS,
  ChatDeliveryError,
  type DigestEntry,
  type MemberTeam,
  type MessageRef,
  type Person,
} from '@standcast/core';
import {
  claimDelivery,
  completeDelivery,
  type DeliveryKey,
  failDelivery,
  getDelivery,
  getInstallation,
  getMemberLogins,
  listDailies,
  MAX_DELIVERY_ATTEMPTS,
  operationalConfig,
} from '@standcast/db';
import type { Deps, WorkerDeps } from '../../deps';
import { resolveMemberTeams } from '../../teams';
import { isChannelLinked } from '../chat/chat';
import { chatUserIdsFor } from '../chat/chat-identity';
import { describeDeliveryError, spaceNotLinked } from './delivery-error';
import { emitEventSafely } from './emit-event';

export const DIGEST_POST_DEADLINE_MS = 5 * 60 * 1000;

export type SendDigestJob = { installationId: number; teamName: string; date: string };

export async function enqueueDigestIfOpen(
  deps: Pick<Deps, 'db' | 'queue'>,
  job: SendDigestJob,
): Promise<void> {
  const delivery = await getDelivery(deps.db, { ...job, kind: 'digest' });
  if (delivery?.status === 'sent') return;
  if (delivery?.status === 'failed' && delivery.attempts >= MAX_DELIVERY_ATTEMPTS) return;
  await deps.queue.enqueue('send-digest', job, {
    singletonKey: `digest:${job.installationId}:${job.teamName}:${job.date}`,
  });
}

type Daily = Awaited<ReturnType<typeof listDailies>>[number];

function teamDailies(team: MemberTeam, dailies: Daily[]): Daily[] {
  return dailies.filter((d) => team.memberLogins.includes(d.login.toLowerCase()));
}

async function enqueueLateDailies(
  deps: WorkerDeps,
  job: SendDigestJob,
  team: MemberTeam,
  snapshot: Daily[],
): Promise<void> {
  const current = teamDailies(team, await listDailies(deps.db, job.installationId, job.date));
  for (const daily of current) {
    const before = snapshot.find((d) => d.memberId === daily.memberId);
    if (before && daily.submittedAt.getTime() <= before.submittedAt.getTime()) continue;
    await deps.queue.enqueue('send-late-daily', {
      installationId: job.installationId,
      memberId: daily.memberId,
      date: job.date,
    });
  }
}

export async function sendDigest(deps: WorkerDeps, job: SendDigestJob): Promise<void> {
  const installation = await getInstallation(deps.db, job.installationId);
  const config = operationalConfig(installation);
  if (!installation || !config) return;
  const teamConfig = config.teams.find((t) => t.name === job.teamName);
  if (!teamConfig) return;

  const key: DeliveryKey = { ...job, kind: 'digest' };
  const claim = await claimDelivery(deps.db, key);
  if (claim.status !== 'claimed') return;
  const claimedAt = deps.now().getTime();

  const provider = teamConfig.chat.provider;
  if (!CHAT_PROVIDERS.includes(provider)) {
    await failDelivery(deps.db, key, claim.token, 'unsupported_provider');
    return;
  }

  let team: MemberTeam;
  let snapshot: Daily[];
  let ref: MessageRef;
  let entries: DigestEntry[];
  let missing: Person[];
  try {
    const chat = await deps.chatFor(job.installationId, provider);
    if (!chat) {
      await failDelivery(deps.db, key, claim.token, 'no_chat_connection');
      return;
    }
    if (!(await isChannelLinked(deps, job.installationId, provider, teamConfig.chat.channel))) {
      await failDelivery(
        deps.db,
        key,
        claim.token,
        describeDeliveryError(spaceNotLinked(), provider),
      );
      return;
    }
    const [resolved] = await resolveMemberTeams(deps, installation.id, installation.accountLogin, {
      ...config,
      teams: [teamConfig],
    });
    if (!resolved) throw new Error('team not resolved');
    team = resolved;
    snapshot = teamDailies(team, await listDailies(deps.db, job.installationId, job.date));
    const chatIds = await chatUserIdsFor(
      deps,
      job.installationId,
      config,
      provider,
      team.memberLogins,
    );
    const stored = await getMemberLogins(deps.db, team.memberLogins);
    const written = new Map(teamConfig.members.map((m) => [m.toLowerCase(), m]));
    const person = (login: string): Person => {
      const lower = login.toLowerCase();
      const display = stored.get(lower) ?? written.get(lower) ?? login;
      const chatUserId = chatIds.get(lower);
      return chatUserId ? { login: display, chatUserId } : { login: display };
    };
    entries = [];
    missing = [];
    for (const login of team.memberLogins) {
      const found = snapshot.find((d) => d.login.toLowerCase() === login);
      if (found) entries.push({ ...person(found.login), daily: found.payload });
      else missing.push(person(login));
    }
    if (deps.now().getTime() - claimedAt > DIGEST_POST_DEADLINE_MS) {
      throw new ChatDeliveryError('deadline_exceeded', 'digest attempt ran past its deadline');
    }
    ref = await chat.postToChannel(
      team.chat.channel,
      buildDigest({ team, date: job.date, entries, missing }),
    );
  } catch (error) {
    await failDelivery(deps.db, key, claim.token, describeDeliveryError(error, provider));
    throw error;
  }

  if (await completeDelivery(deps.db, key, claim.token, ref)) {
    await emitEventSafely(deps, job.installationId, {
      type: 'digest.sent',
      data: {
        team: job.teamName,
        date: job.date,
        submitted: entries.map((e) => e.login),
        missing: missing.map((p) => p.login),
      },
    });
    await enqueueLateDailies(deps, job, team, snapshot);
  }
}
