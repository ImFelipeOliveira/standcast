import { sendAwayNotice, type WorkerDeps } from '@standcast/orchestrator';
import { z } from 'zod';

const schema = z.object({
  installationId: z.number().int(),
  periodId: z.string().min(1),
  action: z.enum(['marked', 'cancelled']),
  byLogin: z.string().min(1),
});

export function sendAwayNoticeJob(deps: WorkerDeps): (data: object) => Promise<void> {
  return (data) => sendAwayNotice(deps, schema.parse(data));
}
