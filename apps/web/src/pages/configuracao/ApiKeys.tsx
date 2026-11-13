import type { SetupStatus } from '@standcast/orchestrator';
import { type FormEvent, useId, useState } from 'react';
import {
  type ApiKeyScope,
  type CreatedApiKey,
  useCreateApiKey,
  useRevokeApiKey,
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
import { API_KEY_SCOPES, errorMessage, formatDate, SCOPE_LABELS } from './labels';
import { OneTimeSecret } from './OneTimeSecret';

type ManagedKeys = Extract<SetupStatus['apiKeys'], { manage: true }>;

function CreateApiKeyDialog({
  installationId,
  onCreated,
}: {
  installationId: number;
  onCreated: (created: CreatedApiKey) => void;
}) {
  const t = useT();
  const id = useId();
  const create = useCreateApiKey(installationId);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<ApiKeyScope[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  const reset = () => {
    setName('');
    setScopes([]);
    setProblem(null);
    create.reset();
  };

  const toggle = (scope: ApiKeyScope, checked: boolean) =>
    setScopes((current) =>
      checked ? [...current.filter((s) => s !== scope), scope] : current.filter((s) => s !== scope),
    );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (scopes.length === 0) {
      setProblem(t('setup.apiKeys.pickScope'));
      return;
    }
    setProblem(null);
    try {
      const created = await create.mutateAsync({
        name: name.trim(),
        scopes: API_KEY_SCOPES.filter((scope) => scopes.includes(scope)),
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
        <Button type="button">{t('setup.apiKeys.new')}</Button>
      </DialogTrigger>
      <DialogContent>
        <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>{t('setup.apiKeys.new')}</DialogTitle>
            <DialogDescription>{t('setup.apiKeys.description')}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-name`}>{t('setup.apiKeys.name')}</Label>
            <Input
              id={`${id}-name`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={80}
              autoComplete="off"
            />
          </div>
          <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
            <legend className="mb-1.5 p-0 font-semibold text-[13px] text-text2">
              {t('setup.apiKeys.scopes')}
            </legend>
            {API_KEY_SCOPES.map((scope) => (
              <div key={scope} className="flex min-h-11 items-center gap-2.5 desk:min-h-8">
                <Checkbox
                  id={`${id}-${scope}`}
                  checked={scopes.includes(scope)}
                  onCheckedChange={(checked) => toggle(scope, checked === true)}
                />
                <Label htmlFor={`${id}-${scope}`} className="font-medium text-text">
                  {t(SCOPE_LABELS[scope])}
                  <code className="font-mono text-[12px] text-muted">{scope}</code>
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
              {t('setup.apiKeys.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ApiKeys({
  installationId,
  apiKeys,
  created,
  onCreated,
  onDismiss,
}: {
  installationId: number;
  apiKeys: ManagedKeys;
  created: CreatedApiKey | null;
  onCreated: (created: CreatedApiKey) => void;
  onDismiss: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const revoke = useRevokeApiKey(installationId);
  const [problem, setProblem] = useState<string | null>(null);

  const revokeKey = (keyId: string) => {
    setProblem(null);
    revoke.mutate(keyId, { onError: (error) => setProblem(errorMessage(t, error)) });
  };

  return (
    <Card aria-labelledby="setup-api-keys">
      <CardHeader>
        <div className="flex flex-col gap-0.5">
          <CardTitle id="setup-api-keys">{t('setup.apiKeys.title')}</CardTitle>
          <CardDescription>{t('setup.apiKeys.description')}</CardDescription>
        </div>
        <CreateApiKeyDialog installationId={installationId} onCreated={onCreated} />
      </CardHeader>
      {created ? (
        <OneTimeSecret
          title={t('setup.apiKeys.created', { name: created.key.name })}
          secret={created.secret}
          copyNow={t('setup.apiKeys.copyNow')}
          hint={t('setup.apiKeys.revokeHint')}
          onDismiss={onDismiss}
        />
      ) : null}
      {problem ? (
        <p role="alert" className="m-0 text-[13px] text-bad-ink">
          {problem}
        </p>
      ) : null}
      {apiKeys.keys.length === 0 ? (
        <p className="m-0 text-[13px] text-muted">{t('setup.apiKeys.none')}</p>
      ) : (
        <Table className="text-[13px]" label={t('setup.apiKeys.title')}>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{t('setup.apiKeys.name')}</TableHead>
              <TableHead scope="col">{t('setup.apiKeys.scopes')}</TableHead>
              <TableHead scope="col">{t('setup.apiKeys.createdAt')}</TableHead>
              <TableHead scope="col">{t('setup.apiKeys.lastUsed')}</TableHead>
              <TableHead scope="col">
                <span className="sr-only">{t('setup.actions')}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {apiKeys.keys.map((key) => (
              <TableRow key={key.id}>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold">{key.name}</span>
                    <code className="font-mono text-[12px] text-muted">sck_{key.prefix}</code>
                  </div>
                </TableCell>
                <TableCell>
                  {key.scopes.map((scope) => t(SCOPE_LABELS[scope])).join(', ')}
                </TableCell>
                <TableCell className="whitespace-nowrap font-mono">
                  {formatDate(lang, key.createdAt)}
                </TableCell>
                <TableCell className="whitespace-nowrap font-mono">
                  {key.lastUsedAt ? formatDate(lang, key.lastUsedAt) : t('setup.apiKeys.never')}
                </TableCell>
                <TableCell className="text-right">
                  {key.revokedAt ? (
                    <Badge variant="neutral">{t('setup.apiKeys.revoked')}</Badge>
                  ) : (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={revoke.isPending && revoke.variables === key.id}
                      onClick={() => revokeKey(key.id)}
                    >
                      {t('setup.apiKeys.revoke')}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
