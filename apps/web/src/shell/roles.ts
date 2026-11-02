import type { OrgContext } from '../api/client';
import type { MessageKey } from '../i18n';

type Translate = (key: MessageKey, vars?: Record<string, string>) => string;

export function roleLabel(context: OrgContext, t: Translate): string {
  if (context.admin) return t('role.admin');
  if (context.managerOf.length > 0) return `${t('role.manager')} · ${context.managerOf.join(', ')}`;
  if (context.memberOf.length > 0) return `${t('role.member')} · ${context.memberOf.join(', ')}`;
  return t('role.member');
}

export function teamsOf(context: OrgContext): string[] {
  return [...new Set([...context.managerOf, ...context.memberOf])].sort((a, b) =>
    a.localeCompare(b),
  );
}
