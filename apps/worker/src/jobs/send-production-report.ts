import { sendProductionReport, type WorkerDeps } from '@standcast/orchestrator';
import { z } from 'zod';

const schema = z.object({
  installationId: z.number().int(),
  teamName: z.string().min(1),
  date: z.iso.date(),
});

export function sendProductionReportJob(deps: WorkerDeps): (data: object) => Promise<void> {
  return (data) => sendProductionReport(deps, schema.parse(data));
}
