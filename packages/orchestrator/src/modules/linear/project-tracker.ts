import type {
  ActivityItem,
  CardSnapshot,
  CardTarget,
  Pending,
  PlanLookupResult,
  Ref,
} from '@standcast/core';

export type CardOwners = { blockers: string[]; assignee: string | null; creator: string | null };

export type StaleCards = { cards: CardSnapshot[]; truncated: boolean };

export interface ProjectTracker {
  readonly connected: boolean;
  cardOwners(ref: Ref): Promise<CardOwners | null>;
  listActivity(login: string, since: Date): Promise<ActivityItem[]>;
  listStaleInProgress(login: string): Promise<StaleCards>;
  listAssignedOpen(login: string): Promise<Pending>;
  lookupCards(
    login: string,
    refs: CardTarget[],
    since: Date,
  ): Promise<Map<string, PlanLookupResult>>;
}

export const nullTracker: ProjectTracker = {
  connected: false,
  cardOwners: async () => null,
  listActivity: async () => [],
  listStaleInProgress: async () => ({ cards: [], truncated: false }),
  listAssignedOpen: async () => ({ items: [], truncated: false }),
  lookupCards: async () => new Map(),
};
