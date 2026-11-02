import { getDraft } from '../api';
import { type Draft, draftWithWork } from '../draft/with-sessions';
import { type Ctx, EXIT } from '../io';
import { requireBoundCredentials, resolveOrg } from '../session';

export async function draft(ctx: Ctx): Promise<number> {
  const { credentials, apiUrl } = await requireBoundCredentials(ctx);
  const org = resolveOrg(ctx, credentials);
  const result = await getDraft(apiUrl, credentials.token, org);
  const output = ctx.flags.sessions
    ? await draftWithWork(result as Draft, { now: new Date(), env: ctx.io.env })
    : result;
  ctx.io.stdout(`${JSON.stringify(output)}\n`);
  return EXIT.ok;
}
