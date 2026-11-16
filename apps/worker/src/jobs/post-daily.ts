import { postDaily, type WorkerDeps } from '@standcast/orchestrator';
import { z } from 'zod';

const schema = z.object({
  installationId: z.number().int(),
  memberId: z.uuid(),
  date: z.iso.date(),
});

export function postDailyJob(deps: WorkerDeps): (data: object) => Promise<void> {
  return (data) => postDaily(deps, schema.parse(data));
}
