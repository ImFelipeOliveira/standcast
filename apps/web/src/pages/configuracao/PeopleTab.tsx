import type { PersonLinks } from '@standcast/orchestrator';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { peopleQuery } from '../../api/queries';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { type MessageKey, useT } from '../../i18n';
import { cn } from '../../lib/utils';
import { Loading } from '../RouteStates';

type Provider =
  | PersonLinks['chat'][number]['provider']
  | PersonLinks['tracker'][number]['provider'];

const PROVIDER_LABELS: Record<Provider, string> = {
  slack: 'Slack',
  'google-chat': 'Google Chat',
  linear: 'Linear',
};

const SOURCE_LABELS: Record<'config' | 'identity', MessageKey> = {
  config: 'people.source.config',
  identity: 'people.source.identity',
};

type Link = {
  provider: Provider;
  status: 'linked' | 'missing';
  source: 'config' | 'identity' | null;
};

function LinkCell({ links }: { links: Link[] }) {
  const t = useT();
  if (links.length === 0) return <span className="text-muted">—</span>;
  return (
    <span className="flex flex-col gap-1.5">
      {links.map((link) => (
        <span key={link.provider} className="flex flex-col gap-0.5">
          <Badge variant={link.status === 'linked' ? 'ok' : 'warn'}>
            {PROVIDER_LABELS[link.provider]} ·{' '}
            {link.status === 'linked' ? t('people.linked') : t('people.missing')}
          </Badge>
          {link.source ? (
            <span className="text-[11px] text-muted">{t(SOURCE_LABELS[link.source])}</span>
          ) : null}
        </span>
      ))}
    </span>
  );
}

function hasIssue(person: PersonLinks): boolean {
  return [...person.chat, ...person.tracker].some((link) => link.status === 'missing');
}

function Callouts({ people }: { people: PersonLinks[] }) {
  const t = useT();
  const missing = new Map<'slack' | 'google-chat', number>();
  for (const person of people) {
    for (const link of person.chat) {
      if (link.status === 'missing')
        missing.set(link.provider, (missing.get(link.provider) ?? 0) + 1);
    }
  }
  if (missing.size === 0) return null;
  return (
    <>
      {[...missing.entries()].map(([provider, count]) => (
        <Card key={provider} className="gap-3 p-4" role="status">
          <h2 className="m-0 font-semibold text-[14px] text-warn-ink">
            {t(count === 1 ? 'people.issue.one' : 'people.issue.other', {
              count: String(count),
              provider: PROVIDER_LABELS[provider],
            })}
          </h2>
          <p className="m-0 text-[13px] text-text2">{t('people.issue.body')}</p>
          <div className="grid grid-cols-1 gap-3 desk:grid-cols-2">
            <div className="flex flex-col gap-1">
              <span className="font-semibold text-[12px] text-muted">
                {t('people.option.self')}
              </span>
              <span className="text-[13px] text-text2">
                {t(
                  provider === 'google-chat'
                    ? 'people.option.selfGoogleChat'
                    : 'people.option.selfSlack',
                )}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="font-semibold text-[12px] text-muted">
                {t('people.option.admin')}
              </span>
              <span className="text-[13px] text-text2">
                {t(
                  provider === 'google-chat'
                    ? 'people.option.adminGoogleChat'
                    : 'people.option.adminSlack',
                )}
              </span>
            </div>
          </div>
        </Card>
      ))}
    </>
  );
}

export function PeopleTab({ installationId }: { installationId: number }) {
  const t = useT();
  const query = useQuery(peopleQuery(installationId));
  const [onlyIssues, setOnlyIssues] = useState(false);
  if (query.isPending) return <Loading header={false} />;
  if (query.isError) return <p className="m-0 text-bad-ink">{t('error.body')}</p>;
  const people = query.data.people;
  const listed = onlyIssues ? people.filter(hasIssue) : people;
  return (
    <div className="flex flex-col gap-4">
      <Callouts people={people} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="m-0 font-semibold text-[15px]">{t('people.title')}</h2>
          <p className="m-0 text-[13px] text-muted">{t('people.subtitle')}</p>
        </div>
        <fieldset className="m-0 flex gap-1 rounded-lg border-0 bg-hover p-0.5">
          <legend className="sr-only">{t('people.filter')}</legend>
          {[false, true].map((value) => (
            <Button
              key={String(value)}
              type="button"
              variant="ghost"
              aria-pressed={onlyIssues === value}
              onClick={() => setOnlyIssues(value)}
              className={cn(
                onlyIssues === value
                  ? 'bg-surface font-semibold text-text ring-1 ring-border-strong'
                  : null,
              )}
            >
              {value ? t('people.onlyIssues') : t('people.all')}
            </Button>
          ))}
        </fieldset>
      </div>
      <Card className="gap-0 overflow-x-auto p-0">
        <table className="w-full min-w-[680px] border-collapse text-[13px]">
          <thead>
            <tr className="border-border border-b text-left text-[12px] text-muted">
              <th scope="col" className="px-4 py-2.5 font-semibold">
                {t('people.person')}
              </th>
              <th scope="col" className="px-4 py-2.5 font-semibold">
                {t('people.teams')}
              </th>
              <th scope="col" className="px-4 py-2.5 font-semibold">
                {t('people.chat')}
              </th>
              <th scope="col" className="px-4 py-2.5 font-semibold">
                {t('people.tracker')}
              </th>
              <th scope="col" className="px-4 py-2.5 font-semibold">
                {t('people.cli')}
              </th>
            </tr>
          </thead>
          <tbody>
            {listed.map((person) => (
              <tr key={person.login} className="border-border border-b align-top last:border-b-0">
                <td className="px-4 py-3 font-mono">@{person.login}</td>
                <td className="px-4 py-3 text-text2">
                  {[
                    ...person.teams,
                    ...person.managerOf.map((team) => t('people.managerOf', { team })),
                  ].join(', ') || '—'}
                </td>
                <td className="px-4 py-3">
                  <LinkCell links={person.chat} />
                </td>
                <td className="px-4 py-3">
                  <LinkCell links={person.tracker} />
                </td>
                <td className="px-4 py-3 text-[12px]">
                  {person.cli ? (
                    <span className="font-mono text-text2">{t('people.cliConnected')}</span>
                  ) : (
                    <span className="text-muted">{t('people.cliNone')}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="m-0 text-[12px] text-muted">{t('people.note')}</p>
    </div>
  );
}
