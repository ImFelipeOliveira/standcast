import { useState } from 'react';
import { ApiError } from '../../api/client';
import type { CreatedApiKey, CreatedWebhook } from '../../api/mutations';
import { useSetupStatus } from '../../api/queries';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { useLang, useT } from '../../i18n';
import { docsUrl } from '../../lib/links';
import { Loading } from '../RouteStates';
import { ApiKeys } from './ApiKeys';
import { ConfigFile } from './ConfigFile';
import { Connections, setupProgress } from './Connections';
import { FailedDeliveries } from './FailedDeliveries';
import { Webhooks } from './Webhooks';

function LoadError({ onRetry }: { onRetry: () => void }) {
  const t = useT();
  return (
    <Card role="alert" className="items-start">
      <h1 className="m-0 font-bold text-[17px]">{t('error.title')}</h1>
      <p className="m-0 text-text2">{t('error.body')}</p>
      <Button type="button" variant="outline" onClick={onRetry}>
        {t('error.retry')}
      </Button>
    </Card>
  );
}

export function ConfiguracaoPage({ installationId }: { installationId: number }) {
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
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="m-0 font-mono text-[12px] text-muted">{status.owner}</p>
          <h1 className="m-0 font-bold text-[30px] leading-tight tracking-[-0.01em]">
            {t('setup.heading')}
          </h1>
          <p className="m-0 text-text2">{t('setup.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Badge variant={progress.done === progress.total ? 'ok' : 'neutral'}>
            {t('setup.progress', { done: String(progress.done), total: String(progress.total) })}
          </Badge>
          <Button asChild variant="outline">
            <a href={docsUrl(lang)}>{t('setup.docs')}</a>
          </Button>
        </div>
      </header>
      <Connections status={status} />
      <ConfigFile status={status} />
      <FailedDeliveries status={status} />
      {status.apiKeys.manage ? (
        <ApiKeys
          installationId={installationId}
          apiKeys={status.apiKeys}
          created={newKey}
          onCreated={setNewKey}
          onDismiss={() => setNewKey(null)}
        />
      ) : null}
      {status.webhooks.manage ? (
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
