import type { SetupStatus } from '@standcast/orchestrator';
import { type FormEvent, useId, useState } from 'react';
import {
  type CreatedWebhook,
  useCreateWebhook,
  useDisableWebhook,
  useRedeliverWebhook,
  useTestWebhook,
  type WebhookDelivery,
  type WebhookEndpoint,
  type WebhookEvent,
} from '../../api/mutations';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Checkbox } from '../../components/ui/checkbox';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { useLang, useT } from '../../i18n';
import {
  DELIVERY_LABELS,
  EVENT_LABELS,
  errorMessage,
  formatDate,
  type Translate,
  WEBHOOK_EVENTS,
} from './labels';
import { OneTimeSecret } from './OneTimeSecret';

type ManagedWebhooks = Extract<SetupStatus['webhooks'], { manage: true }>;

const DELIVERY_VARIANTS = {
  pending: 'neutral',
  delivered: 'ok',
  failed: 'bad',
} as const satisfies Record<WebhookDelivery['status'], 'neutral' | 'ok' | 'bad'>;

function CreateWebhookDialog({
  installationId,
  onCreated,
}: {
  installationId: number;
  onCreated: (created: CreatedWebhook) => void;
}) {
  const t = useT();
  const id = useId();
  const create = useCreateWebhook(installationId);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  const reset = () => {
    setUrl('');
    setEvents([]);
    setProblem(null);
    create.reset();
  };

  const toggle = (event: WebhookEvent, checked: boolean) =>
    setEvents((current) =>
      checked ? [...current.filter((e) => e !== event), event] : current.filter((e) => e !== event),
    );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (events.length === 0) {
      setProblem(t('setup.webhooks.pickEvent'));
      return;
    }
    setProblem(null);
    try {
      const created = await create.mutateAsync({
        url: url.trim(),
        events: WEBHOOK_EVENTS.filter((e) => events.includes(e)),
      });
      onCreated(created);
      reset();
      setOpen(false);
    } catch (error) {
      setProblem(errorMessage(t, error));
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button">{t('setup.webhooks.new')}</Button>
      </DialogTrigger>
      <DialogContent>
        <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>{t('setup.webhooks.new')}</DialogTitle>
            <DialogDescription>{t('setup.webhooks.description')}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-url`}>{t('setup.webhooks.url')}</Label>
            <Input
              id={`${id}-url`}
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              required
              maxLength={2048}
              pattern="https://.*"
              placeholder="https://"
              autoComplete="off"
            />
          </div>
          <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
            <legend className="mb-1.5 p-0 font-semibold text-[13px] text-text2">
              {t('setup.webhooks.events')}
            </legend>
            {WEBHOOK_EVENTS.map((webhookEvent) => (
              <div key={webhookEvent} className="flex min-h-11 items-center gap-2.5 desk:min-h-8">
                <Checkbox
                  id={`${id}-${webhookEvent}`}
                  checked={events.includes(webhookEvent)}
                  onCheckedChange={(checked) => toggle(webhookEvent, checked === true)}
                />
                <Label htmlFor={`${id}-${webhookEvent}`} className="font-medium text-text">
                  {t(EVENT_LABELS[webhookEvent])}
                  <code className="font-mono text-[12px] text-muted">{webhookEvent}</code>
                </Label>
              </div>
            ))}
          </fieldset>
          {problem ? (
            <p role="alert" className="m-0 text-[13px] text-bad-ink">
              {problem}
            </p>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t('setup.cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={create.isPending}>
              {t('setup.webhooks.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EndpointStatus({ t, endpoint }: { t: Translate; endpoint: WebhookEndpoint }) {
  if (endpoint.active) return <Badge variant="ok">{t('setup.webhooks.active')}</Badge>;
  if (endpoint.disabledReason === 'failures') {
    return (
      <Badge variant="bad">
        {t('setup.webhooks.disabledFailures', { count: String(endpoint.consecutiveFailures) })}
      </Badge>
    );
  }
  return <Badge variant="neutral">{t('setup.webhooks.disabled')}</Badge>;
}

function lastDelivery(deliveries: WebhookDelivery[], endpointId: string): Date | null {
  return deliveries
    .filter((delivery) => delivery.endpointId === endpointId)
    .map((delivery) => new Date(delivery.createdAt))
    .reduce<Date | null>((latest, at) => (latest && latest > at ? latest : at), null);
}

function Deliveries({
  t,
  deliveries,
  activeEndpoints,
  redeliveringId,
  onRedeliver,
}: {
  t: Translate;
  deliveries: WebhookDelivery[];
  activeEndpoints: ReadonlySet<string>;
  redeliveringId: string | null;
  onRedeliver: (delivery: WebhookDelivery) => void;
}) {
  const lang = useLang();
  return (
    <div className="flex flex-col gap-2.5">
      <h3 className="m-0 font-semibold text-[11px] text-muted uppercase tracking-[0.06em]">
        {t('setup.webhooks.deliveriesTitle')}
      </h3>
      {deliveries.length === 0 ? (
        <p className="m-0 text-[13px] text-muted">{t('setup.webhooks.noDeliveries')}</p>
      ) : (
        <Table className="text-[13px]">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{t('setup.webhooks.createdAt')}</TableHead>
              <TableHead scope="col">{t('setup.webhooks.event')}</TableHead>
              <TableHead scope="col">{t('setup.webhooks.status')}</TableHead>
              <TableHead scope="col">{t('setup.webhooks.attempts')}</TableHead>
              <TableHead scope="col">{t('setup.webhooks.response')}</TableHead>
              <TableHead scope="col">
                <span className="sr-only">{t('setup.webhooks.actions')}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deliveries.map((delivery) => (
              <TableRow key={delivery.id}>
                <TableCell className="whitespace-nowrap font-mono">
                  {formatDate(lang, delivery.createdAt)}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <code className="font-mono text-[12px]">{delivery.event}</code>
                    <code className="break-all font-mono text-[12px] text-muted">
                      {delivery.endpointUrl}
                    </code>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={DELIVERY_VARIANTS[delivery.status]}>
                    {t(DELIVERY_LABELS[delivery.status])}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono">{delivery.attempts}</TableCell>
                <TableCell>
                  {delivery.lastStatusCode !== null || delivery.lastError ? (
                    <span className="flex flex-wrap items-center gap-1.5">
                      {delivery.lastStatusCode !== null ? (
                        <span className="font-mono">{delivery.lastStatusCode}</span>
                      ) : null}
                      {delivery.lastError ? (
                        <code className="font-mono text-[12px]">{delivery.lastError}</code>
                      ) : null}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="text-right">
                  {delivery.status === 'failed' && activeEndpoints.has(delivery.endpointId) ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={redeliveringId === delivery.id}
                      onClick={() => onRedeliver(delivery)}
                    >
                      {t('setup.webhooks.redeliver')}
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

export function Webhooks({
  installationId,
  webhooks,
  created,
  onCreated,
  onDismiss,
}: {
  installationId: number;
  webhooks: ManagedWebhooks;
  created: CreatedWebhook | null;
  onCreated: (created: CreatedWebhook) => void;
  onDismiss: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const disable = useDisableWebhook(installationId);
  const sendTest = useTestWebhook(installationId);
  const redeliver = useRedeliverWebhook(installationId);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const onError = (error: Error) => setProblem(errorMessage(t, error));
  const clear = () => {
    setProblem(null);
    setNotice(null);
  };

  const disableEndpoint = (endpoint: WebhookEndpoint) => {
    clear();
    disable.mutate(endpoint.id, { onError });
  };

  const testEndpoint = (endpoint: WebhookEndpoint) => {
    clear();
    sendTest.mutate(endpoint.id, {
      onError,
      onSuccess: () => setNotice(t('setup.webhooks.testQueued', { url: endpoint.url })),
    });
  };

  const redeliverDelivery = (delivery: WebhookDelivery) => {
    clear();
    redeliver.mutate(delivery.id, {
      onError,
      onSuccess: () => setNotice(t('setup.webhooks.redeliverQueued')),
    });
  };

  return (
    <Card aria-labelledby="setup-webhooks">
      <CardHeader>
        <div className="flex flex-col gap-0.5">
          <CardTitle id="setup-webhooks">{t('setup.webhooks.title')}</CardTitle>
          <CardDescription>{t('setup.webhooks.description')}</CardDescription>
        </div>
        <CreateWebhookDialog installationId={installationId} onCreated={onCreated} />
      </CardHeader>
      {created ? (
        <OneTimeSecret
          title={t('setup.webhooks.created', { url: created.endpoint.url })}
          secret={created.secret}
          copyNow={t('setup.webhooks.copyNow')}
          hint={t('setup.webhooks.disableHint')}
          onDismiss={onDismiss}
        />
      ) : null}
      {problem ? (
        <p role="alert" className="m-0 text-[13px] text-bad-ink">
          {problem}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="m-0 text-[13px] text-ok-ink">
          {notice}
        </p>
      ) : null}
      {webhooks.endpoints.length === 0 ? (
        <p className="m-0 text-[13px] text-muted">{t('setup.webhooks.none')}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {webhooks.endpoints.map((endpoint) => {
            const last = lastDelivery(webhooks.deliveries, endpoint.id);
            return (
              <li
                key={endpoint.id}
                className="flex flex-wrap items-center gap-2.5 rounded-xl border border-border px-4 py-3.5"
              >
                <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-1">
                  <code className="break-all font-mono text-[13px]">{endpoint.url}</code>
                  <span className="text-[12px] text-muted">
                    {t('setup.webhooks.createdAt')} {formatDate(lang, endpoint.createdAt)}
                    {last ? ` · ${t('setup.webhooks.lastDelivery')} ${formatDate(lang, last)}` : ''}
                  </span>
                </div>
                <span className="flex flex-wrap gap-1.5">
                  {endpoint.events.map((event) => (
                    <Badge key={event} className="font-medium" title={event}>
                      {t(EVENT_LABELS[event])}
                    </Badge>
                  ))}
                </span>
                <EndpointStatus t={t} endpoint={endpoint} />
                {endpoint.active ? (
                  <span className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={sendTest.isPending && sendTest.variables === endpoint.id}
                      onClick={() => testEndpoint(endpoint)}
                    >
                      {t('setup.webhooks.sendTest')}
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={disable.isPending && disable.variables === endpoint.id}
                      onClick={() => disableEndpoint(endpoint)}
                    >
                      {t('setup.webhooks.disable')}
                    </Button>
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <Deliveries
        t={t}
        deliveries={webhooks.deliveries}
        activeEndpoints={
          new Set(webhooks.endpoints.filter((endpoint) => endpoint.active).map((e) => e.id))
        }
        redeliveringId={redeliver.isPending ? (redeliver.variables ?? null) : null}
        onRedeliver={redeliverDelivery}
      />
    </Card>
  );
}
