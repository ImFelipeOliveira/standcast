import type { SetupStatus } from '@standcast/orchestrator';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { type Lang, useLang, useT } from '../../i18n';
import { reasonText } from './labels';
import { LooseNotices, Teams } from './Teams';

export function standcastYmlTemplate(login: string, teamName: string, lang: Lang): string {
  return `teams:
  - name: ${teamName}
    language: ${lang}
    timezone: America/Sao_Paulo
    remind_at: "09:00"
    digest_at: "10:00"
    managers: [${login}]
    members: [${login}]
    chat:
      provider: slack
      channel: "#daily"
`;
}

export function newConfigFileUrl(owner: string, branch: string, template: string): string {
  return `https://github.com/${encodeURIComponent(owner)}/.github/new/${encodeURIComponent(branch)}?filename=standcast.yml&value=${encodeURIComponent(template)}`;
}

export const NEW_CONFIG_REPO_URL = 'https://github.com/new?name=.github&visibility=private';

function LinkButton({ href, primary, label }: { href: string; primary?: boolean; label: string }) {
  return (
    <Button asChild variant={primary ? 'default' : 'outline'}>
      <a href={href}>{label}</a>
    </Button>
  );
}

export function ConfigFile({ status }: { status: SetupStatus }) {
  const t = useT();
  const lang = useLang();
  const { config } = status;
  const configured = config.status === 'configured';
  const template = standcastYmlTemplate(status.login, t('setup.config.templateTeam'), lang);
  const names = new Set(configured ? status.teams.map((team) => team.name) : []);
  const looseNotices = status.teamNotices.filter((notice) => !names.has(notice.team));
  const action =
    config.status === 'unconfigured' ? (
      status.configRepo.exists ? (
        <LinkButton
          primary
          href={newConfigFileUrl(status.owner, status.configRepo.defaultBranch, template)}
          label={t('setup.config.createFile')}
        />
      ) : (
        <LinkButton primary href={NEW_CONFIG_REPO_URL} label={t('setup.config.createRepo')} />
      )
    ) : status.configFileUrl ? (
      <LinkButton href={status.configFileUrl} label={t('setup.config.editOnGithub')} />
    ) : null;
  return (
    <Card aria-labelledby="setup-config">
      <CardHeader>
        <div className="flex flex-col gap-0.5">
          <CardTitle id="setup-config">{t('setup.config.title')}</CardTitle>
          <CardDescription>
            {configured
              ? t('setup.config.description')
              : config.status === 'invalid'
                ? t('setup.config.invalid')
                : t('setup.config.missing')}
          </CardDescription>
        </div>
        <span className="flex flex-wrap items-center gap-2">
          {configured ? (
            <Badge variant="ok">{t('setup.badge.configured')}</Badge>
          ) : config.status === 'invalid' ? (
            <Badge variant="bad">{t('setup.badge.needsAttention')}</Badge>
          ) : (
            <Badge variant="neutral">{t('setup.badge.todo')}</Badge>
          )}
          {action}
        </span>
      </CardHeader>
      <LooseNotices notices={looseNotices} />
      {configured ? <Teams teams={status.teams} notices={status.teamNotices} /> : null}
      {config.status === 'invalid' ? (
        <>
          {config.lastValid ? (
            <p className="m-0 text-[13px]">{t('setup.config.keepsLastValid')}</p>
          ) : null}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{t('setup.config.path')}</TableHead>
                <TableHead scope="col">{t('setup.config.error')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {config.errors.map((error) => (
                <TableRow key={`${error.path}:${error.message}`}>
                  <TableCell>
                    <code className="font-mono text-[12px]">{error.path}</code>
                  </TableCell>
                  <TableCell>{error.message}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      ) : null}
      {config.status === 'unconfigured' ? (
        <>
          <p className="m-0 text-[13px]">
            {t('setup.config.reason')}: <code className="font-mono">{config.reason}</code>{' '}
            {reasonText(t, config.reason)}
          </p>
          <p className="m-0 text-[13px]">{t('setup.config.instruction')}</p>
          <h3 className="m-0 font-semibold text-[11px] text-muted uppercase tracking-[0.06em]">
            {t('setup.config.template')}
          </h3>
          <pre className="m-0 overflow-x-auto rounded-xl border border-border bg-bg p-4 font-mono text-[12px] text-text">
            {template}
          </pre>
        </>
      ) : null}
    </Card>
  );
}
