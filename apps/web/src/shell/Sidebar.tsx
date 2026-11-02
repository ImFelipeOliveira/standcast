import type { TeamSummary } from '@standcast/orchestrator';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import type { Installation } from '../api/client';
import { useOrgContext, useTeamsSummary } from '../api/queries';
import { Badge } from '../components/ui/badge';
import { useT } from '../i18n';
import { cn } from '../lib/utils';
import { Logo } from './Logo';
import { OrgSelect } from './OrgSelect';
import { teamsOf } from './roles';
import { SECTION_LABELS, SECTION_PATHS, SECTIONS, type Section, SOON_SECTIONS } from './sections';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';

const ICONS: Record<Section, ReactNode> = {
  hoje: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  historico: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5M12 7v5l3 2" />
    </>
  ),
  configuracao: (
    <>
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="18" cy="18" r="2" />
    </>
  ),
};

type Props = {
  installations: Installation[];
  installationId: number;
  section: Section;
  team: string | null;
  onOrgChange: (installationId: number) => void;
};

function sentOf(summary: TeamSummary[] | undefined, team: string): string | null {
  const entry = summary?.find((item) => item.team === team);
  return entry ? `${entry.sent}/${entry.total}` : null;
}

export function Sidebar({ installations, installationId, section, team, onOrgChange }: Props) {
  const t = useT();
  const context = useOrgContext(installationId);
  const teams = context.data ? teamsOf(context.data) : [];
  const summary = useTeamsSummary(installationId, section === 'hoje' && teams.length > 0);
  return (
    <aside className="box-border flex max-w-full flex-[1_1_232px] flex-col gap-6 border-border-strong border-b bg-surface px-4 py-5 text-text desk:sticky desk:top-0 desk:h-screen desk:flex-[0_0_248px] desk:self-start desk:overflow-y-auto desk:border-r desk:border-b-0">
      <div className="flex items-center gap-2.5 px-2">
        <Logo />
        <ThemeToggle />
      </div>
      <OrgSelect installations={installations} current={installationId} onChange={onOrgChange} />
      <nav aria-label={t('nav.label')} className="flex flex-col gap-1">
        {SECTIONS.map((item) => {
          const active = item === section;
          return (
            <Link
              key={item}
              to={SECTION_PATHS[item]}
              params={{ installationId }}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-11 items-center gap-2.5 rounded-[9px] px-3 font-medium text-sm no-underline desk:min-h-10',
                active
                  ? 'bg-accent text-on-accent hover:bg-accent-hover'
                  : 'text-text2 hover:bg-hover hover:text-text',
              )}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                {ICONS[item]}
              </svg>
              {t(SECTION_LABELS[item])}
              {SOON_SECTIONS.has(item) ? (
                <Badge
                  variant={active ? 'outline' : 'neutral'}
                  className="ml-auto px-2 text-[11px]"
                >
                  {t('nav.soon')}
                </Badge>
              ) : null}
            </Link>
          );
        })}
      </nav>
      {teams.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <span className="px-2 font-semibold text-[11px] text-muted uppercase tracking-[0.06em]">
            {t('teams.label')}
          </span>
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
            {teams.map((name) => {
              const active = name === team;
              const sent = section === 'hoje' ? sentOf(summary.data, name) : null;
              return (
                <li key={name}>
                  <Link
                    to="/orgs/$installationId/hoje"
                    params={{ installationId }}
                    search={{ team: name }}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex min-h-11 items-center justify-between gap-2 rounded-[9px] px-3 font-medium text-sm no-underline desk:min-h-10',
                      active ? 'bg-hover text-text' : 'text-text2 hover:bg-hover hover:text-text',
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span aria-hidden="true" className="size-2 flex-none rounded-full bg-mark" />
                      <span className="truncate">{name}</span>
                    </span>
                    {sent ? <span className="font-mono text-[12px] text-muted">{sent}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      <div className="mt-auto border-border border-t pt-2">
        <UserMenu installationId={installationId} />
      </div>
    </aside>
  );
}
