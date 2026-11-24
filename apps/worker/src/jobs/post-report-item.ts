import { postReportItem, type WorkerDeps } from '@standcast/orchestrator';
import { z } from 'zod';

const schema = z.object({
  installationId: z.number().int(),
  teamName: z.string().min(1),
  date: z.iso.date(),
  index: z.number().int().nonnegative(),
  thread: z.object({ channel: z.string().min(1), id: z.string().min(1) }),
});

export function postReportItemJob(deps: WorkerDeps): (data: object) => Promise<void> {
  return (data) => postReportItem(deps, schema.parse(data));
}
