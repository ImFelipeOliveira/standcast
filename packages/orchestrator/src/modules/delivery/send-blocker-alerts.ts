import {
  addCalendarDays,
  buildBlockerAlert,
  ChatDeliveryError,
  type ChatProvider,
  calendarDaysBetween,
  type MessageRef,
  type Person,
  type StandcastConfig,
} from '@standcast/core';
import {
  claimDelivery,
  completeDelivery,
  type DeliveryKey,
  type DeliveryRow,
  failDelivery,
  getDelivery,
  getInstallation,
  getInstallationMemberIds,
  getMemberLogins,
  listBlockerRouteRecipients,
  listSentDeliverySubjects,
  listStaleBlockerStates,
  MAX_DELIVERY_ATTEMPTS,
  markBlockerStateAlerted,
  type OpenBlockerState,
  operationalConfig,
} from '@standcast/db';
import type { Deps, WorkerDeps } from '../../deps';
import { resolveTeamsWithNotices } from '../../teams';
import { isChannelLinked } from '../chat/chat';
import { chatUserIdsFor } from '../chat/chat-identity';
import { describeDeliveryError, spaceNotLinked } from './delivery-error';

export const SEND_BLOCKER_ALERTS_JOB = 'send-blocker-alerts';
export const MAX_BLOCKER_ALERTS_PER_SCAN = 10;
export const MAX_ALERT_MANAGER_MENTIONS = 20;
export const ALERT_POST_DEADLINE_MS = 5 * 60 * 1000;

export type SendBlockerAlertsJob = { installationId: number; teamName: string; date: string };

const scanKey = (job: SendBlockerAlertsJob): DeliveryKey => ({ ...job, kind: 'blocker_alert' });
const postKey = (job: SendBlockerAlertsJob, stateId: string): DeliveryKey => ({
  ...job,
  kind: 'blocker_alert_post',
  subject: stateId,
});

function settled(row: DeliveryRow | null): boolean {
  if (row?.status === 'sent') return true;
  return row?.status === 'failed' && row.attempts >= MAX_DELIVERY_ATTEMPTS;
}

export async function enqueueBlockerAlertsIfDue(
  deps: Pick<Deps, 'db' | 'queue'>,
  job: SendBlockerAlertsJob,
): Promise<void> {
  if (settled(await getDelivery(deps.db, scanKey(job)))) return;
  const digest = await getDelivery(deps.db, { ...job, kind: 'digest' });
  if (digest?.status !== 'sent') return;
  await deps.queue.enqueue(SEND_BLOCKER_ALERTS_JOB, job, {
    singletonKey: `blocker-alert:${job.installationId}:${job.teamName}:${job.date}`,
  });
}

async function managerPeople(
  deps: WorkerDeps,
  installationId: number,
  config: StandcastConfig,
  provider: ChatProvider,
  managerLogins: string[],
): Promise<Person[]> {
  const logins = [...managerLogins].sort().slice(0, MAX_ALERT_MANAGER_MENTIONS);
  const chatIds = await chatUserIdsFor(deps, installationId, config, provider, logins);
  const stored = await getMemberLogins(deps.db, logins);
  return logins.map((login) => {
    const display = stored.get(login) ?? login;
    const chatUserId = chatIds.get(login);
    return chatUserId ? { login: display, chatUserId } : { login: display };
  });
}

async function routesOf(
  deps: WorkerDeps,
  installationId: number,
  states: OpenBlockerState[],
): Promise<Map<string, string[]>> {
  const rows = await listBlockerRouteRecipients(
    deps.db,
    installationId,
    [...new Set(states.map((s) => s.authorMemberId))],
    [...new Set(states.map((s) => s.blockerId))],
  );
  const routes = new Map<string, string[]>();
  for (const row of rows) {
    const key = `${row.authorMemberId}:${row.blockerId}`;
    const logins = routes.get(key) ?? [];
    if (!logins.includes(row.login)) logins.push(row.login);
    routes.set(key, logins);
  }
  return routes;
}

async function staleStates(
  deps: WorkerDeps,
  job: SendBlockerAlertsJob,
  memberLogins: string[],
  alertDays: number,
): Promise<OpenBlockerState[]> {
  const sent = await listSentDeliverySubjects(deps.db, { ...job, kind: 'blocker_alert_post' });
  for (const stateId of sent) {
    await markBlockerStateAlerted(deps.db, job.installationId, stateId, {
      teamName: job.teamName,
      at: deps.now(),
    });
  }
  const limit = MAX_BLOCKER_ALERTS_PER_SCAN - sent.length;
  if (limit <= 0) return [];
  const memberIds = await getInstallationMemberIds(deps.db, job.installationId, memberLogins);
  return listStaleBlockerStates(deps.db, job.installationId, {
    teamName: job.teamName,
    authorMemberIds: [...memberIds.values()],
    openedOnOrBefore: addCalendarDays(job.date, -alertDays),
    limit,
  });
}

async function postOnce(
  deps: WorkerDeps,
  job: SendBlockerAlertsJob,
  stateId: string,
  provider: ChatProvider,
  post: () => Promise<MessageRef>,
): Promise<MessageRef | null | 'skip'> {
  const key = postKey(job, stateId);
  const claim = await claimDelivery(deps.db, key);
  if (claim.status === 'in_progress') throw new Error('blocker_alert_post_in_progress');
  if (claim.status === 'already_sent') {
    const row = await getDelivery(deps.db, key);
    return row?.status === 'sent' ? row.ref : 'skip';
  }
  try {
    const ref = await post();
    await completeDelivery(deps.db, key, claim.token, ref);
    return ref;
  } catch (error) {
    await failDelivery(deps.db, key, claim.token, describeDeliveryError(error, provider));
    throw error;
  }
}

export async function sendBlockerAlerts(
  deps: WorkerDeps,
  job: SendBlockerAlertsJob,
): Promise<void> {
  const installation = await getInstallation(deps.db, job.installationId);
  const config = operationalConfig(installation);
  if (!installation || !config) return;
  const teamConfig = config.teams.find((t) => t.name === job.teamName);
  const alertDays = teamConfig?.signals.blockerAlertDays;
  if (!teamConfig || !alertDays) return;

  const key = scanKey(job);
  const claim = await claimDelivery(deps.db, key);
  if (claim.status !== 'claimed') return;

  const claimedAt = deps.now().getTime();
  const provider = teamConfig.chat.provider;
  let lastRef: MessageRef | null = null;
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
    const { teams, notices } = await resolveTeamsWithNotices(
      deps,
      installation.id,
      installation.accountLogin,
      { ...config, teams: [teamConfig] },
    );
    const team = teams[0];
    if (!team) throw new Error('team not resolved');
    if (notices.some((notice) => notice.kind === 'managers_unavailable')) {
      throw new Error('blocker_alert_managers_unavailable');
    }
    const states =
      team.managerLogins.length > 0
        ? await staleStates(deps, job, team.memberLogins, alertDays)
        : [];
    if (states.length > 0) {
      const managers = await managerPeople(
        deps,
        installation.id,
        config,
        provider,
        team.managerLogins,
      );
      const routes = await routesOf(deps, installation.id, states);
      for (const state of states) {
        if (deps.now().getTime() - claimedAt > ALERT_POST_DEADLINE_MS) {
          throw new ChatDeliveryError(
            'deadline_exceeded',
            'blocker alert attempt ran past its deadline',
          );
        }
        const ref = await postOnce(deps, job, state.id, provider, () =>
          chat.postToChannel(
            team.chat.channel,
            buildBlockerAlert({
              lang: team.language,
              team: team.name,
              managers,
              author: state.authorLogin,
              blocker: state.ref ? { text: state.text, ref: state.ref } : { text: state.text },
              ageDays: calendarDaysBetween(state.openedOn, job.date),
              openedOn: state.openedOn,
              routedTo: routes.get(`${state.authorMemberId}:${state.blockerId}`) ?? [],
            }),
          ),
        );
        if (ref === 'skip') continue;
        lastRef = ref ?? lastRef;
        await markBlockerStateAlerted(deps.db, installation.id, state.id, {
          teamName: job.teamName,
          at: deps.now(),
        });
      }
    }
    await completeDelivery(deps.db, key, claim.token, lastRef);
  } catch (error) {
    await failDelivery(deps.db, key, claim.token, describeDeliveryError(error, provider));
    throw error;
  }
}
