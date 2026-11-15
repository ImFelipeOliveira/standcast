import { clampTitle, type Pending, type PendingItem } from '@standcast/core';
import { z } from 'zod';
import { nodesOf } from './activity';
import type { LinearClient } from './client';

export const ASSIGNED_PAGE_SIZE = 50;

const ASSIGNED_QUERY = `query AssignedOpen($userId: ID!, $teamKey: String!) {
  issues(
    filter: {
      assignee: { id: { eq: $userId } }
      team: { key: { eq: $teamKey } }
      or: [
        { state: { type: { eq: "started" } } }
        { state: { type: { eq: "unstarted" } }, priority: { in: [1, 2] } }
      ]
    }
    first: ${ASSIGNED_PAGE_SIZE}
  ) {
    nodes { identifier url title updatedAt priority state { name } }
  }
}`;

const PRIORITIES: Record<number, NonNullable<PendingItem['priority']>> = {
  0: 'none',
  1: 'urgent',
  2: 'high',
  3: 'medium',
  4: 'low',
};

const assignedNode = z.object({
  url: z.string().min(1),
  title: z.string(),
  updatedAt: z.string().min(1),
  priority: z.number().nullish(),
  state: z.object({ name: z.string() }).nullish(),
});

function itemOf(raw: unknown): PendingItem | null {
  const parsed = assignedNode.safeParse(raw);
  if (!parsed.success) return null;
  const { url, updatedAt, priority, state } = parsed.data;
  const title = clampTitle(parsed.data.title);
  const item: PendingItem = {
    kind: 'card',
    ref: { kind: 'card', url, title },
    title,
    since: updatedAt,
    priority: PRIORITIES[priority ?? 0] ?? 'none',
  };
  return state ? { ...item, state: state.name } : item;
}

export async function listAssignedOpen(
  client: LinearClient,
  input: { userId: string; teamKey: string },
): Promise<Pending> {
  const data = await client.query<unknown>(ASSIGNED_QUERY, {
    userId: input.userId,
    teamKey: input.teamKey,
  });
  const nodes = nodesOf(data);
  const items = nodes.flatMap((raw) => {
    const item = itemOf(raw);
    return item ? [item] : [];
  });
  return { items, truncated: nodes.length >= ASSIGNED_PAGE_SIZE };
}
