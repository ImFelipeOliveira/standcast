import { t } from '@standcast/core';
import { cancelAway, listAway, markAway } from '../api';
import { type Ctx, EXIT, ExitError } from '../io';
import { requireBoundCredentials, resolveOrg } from '../session';

export async function away(ctx: Ctx): Promise<number> {
  const [action, id, ...rest] = ctx.args ?? [];
  const { from, until } = ctx.flags;
  const usage = new ExitError(EXIT.error, t(ctx.lang, 'cli.awayUsage'));
  if (action === 'list') {
    if (id !== undefined) throw usage;
    const { credentials, apiUrl } = await requireBoundCredentials(ctx);
    const result = await listAway(apiUrl, credentials.token, resolveOrg(ctx, credentials));
    ctx.io.stdout(`${JSON.stringify(result.data)}\n`);
    return EXIT.ok;
  }
  if (action === 'cancel') {
    if (!id || rest.length > 0) throw usage;
    const { credentials, apiUrl } = await requireBoundCredentials(ctx);
    await cancelAway(apiUrl, credentials.token, resolveOrg(ctx, credentials), id);
    ctx.io.stdout(`${JSON.stringify({ id, cancelled: true })}\n`);
    return EXIT.ok;
  }
  if (action !== undefined || !until) throw usage;
  const { credentials, apiUrl } = await requireBoundCredentials(ctx);
  const period = await markAway(apiUrl, credentials.token, resolveOrg(ctx, credentials), {
    ...(from ? { from } : {}),
    until,
  });
  ctx.io.stdout(`${JSON.stringify(period)}\n`);
  return EXIT.ok;
}
