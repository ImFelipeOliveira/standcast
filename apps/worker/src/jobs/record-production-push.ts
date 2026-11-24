import { recordProductionPush, type WorkerDeps } from '@standcast/orchestrator';
import { z } from 'zod';

const schema = z.object({
  installationId: z.number().int(),
  owner: z.string().min(1),
  repo: z.string().min(1),
  branch: z.string().min(1),
  before: z.string().min(1),
  after: z.string().min(1),
  receivedAt: z.iso.datetime(),
});

export function recordProductionPushJob(deps: WorkerDeps): (data: object) => Promise<void> {
  return async (data) => {
    await recordProductionPush(deps, schema.parse(data));
  };
}
