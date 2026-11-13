import { type ReactNode, useState } from 'react';
import { ApiError } from '../../api/client';
import type { CreatedApiKey, CreatedWebhook } from '../../api/mutations';
import { useSetupStatus } from '../../api/queries';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { useLang, useT } from '../../i18n';
import { docsUrl } from '../../lib/links';
import { PageHeader } from '../../shell/PageHeader';
import { SectionHeader } from '../../shell/SectionHeader';
import { Loading } from '../RouteStates';
import { ApiKeys } from './ApiKeys';
import { ConfigFile } from './ConfigFile';
import { Connections, setupProgress } from './Connections';
import { FailedDeliveries } from './FailedDeliveries';
import { Webhooks } from './Webhooks';

export function LoadError({ onRetry, header = true }: { onRetry: () => void; header?: boolean }) {
  const t = useT();
  return (
    <>
      {header ? <SectionHeader /> : null}
      <Card role="alert" className="items-start">
        <h2 className="m-0 font-bold text-[17px]">{t('error.title')}</h2>
        <p className="m-0 text-text2">{t('error.body')}</p>
        <Button type="button" variant="outline" onClick={onRetry}>
          {t('error.retry')}
        </Button>
      </Card>
    </>
  );
}

export function ConfiguracaoPage({
  installationId,
  connected,
  tab = 'general',
  tabs,
}: {
  installationId: number;
  connected?: 'slack' | 'linear';
  tab?: 'general' | 'api';
  tabs?: ReactNode;
}) {
  const t = useT();
  const lang = useLang();
  const setup = useSetupStatus(installationId);
  const [newKey, setNewKey] = useState<CreatedApiKey | null>(null);
  const [newWebhook, setNewWebhook] = useState<CreatedWebhook | null>(null);

  if (setup.isPending) return <Loading />;
  if (setup.isError) {
    if (setup.error instanceof ApiError && setup.error.status === 401) return <Loading />;
    return <LoadError onRetry={() => void setup.refetch()} />;
  }

  const status = setup.data;
  const progress = setupProgress(status);
  return (
    <>
      <PageHeader
        context={status.owner}
        title={t('setup.heading')}
        actions={
          <>
            {tabs}
            <Badge variant={progress.done === progress.total ? 'ok' : 'neutral'}>
              {t('setup.progress', { done: String(progress.done), total: String(progress.total) })}
            </Badge>
            <Button asChild variant="outline">
              <a href={docsUrl(lang)}>{t('setup.docs')}</a>
            </Button>
          </>
        }
      />
      <div className="flex flex-col gap-1">
        <p className="m-0 text-text2">{t('setup.subtitle')}</p>
        {connected === 'slack' ? (
          <p role="status" className="m-0 text-text2">
            {t('setup.connected.slack')}
          </p>
        ) : null}
        {connected === 'linear' ? (
          <p role="status" className="m-0 text-text2">
            {t('setup.connected.linear')}
          </p>
        ) : null}
      </div>
      {tab === 'general' ? (
        <>
          <Connections status={status} />
          <ConfigFile status={status} />
          <FailedDeliveries status={status} />
        </>
      ) : null}
      {tab === 'api' && status.apiKeys.manage ? (
        <ApiKeys
          installationId={installationId}
          apiKeys={status.apiKeys}
          created={newKey}
          onCreated={setNewKey}
          onDismiss={() => setNewKey(null)}
        />
      ) : null}
      {tab === 'api' && status.webhooks.manage ? (
        <Webhooks
          installationId={installationId}
          webhooks={status.webhooks}
          created={newWebhook}
          onCreated={setNewWebhook}
          onDismiss={() => setNewWebhook(null)}
        />
      ) : null}
      <p className="m-0 text-[12px] text-muted">
        {t('setup.support')}{' '}
        <a
          className="text-accent-text hover:text-accent-ink"
          href={`mailto:${status.supportEmail}`}
        >
          {status.supportEmail}
        </a>
      </p>
    </>
  );
}
