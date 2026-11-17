import { Link } from '@tanstack/react-router';
import { ApiError } from '../../api/client';
import { useCompleteChatLink } from '../../api/mutations';
import {
  type ChatLinkPreviewView,
  type ChatLinkResultView,
  useChatLinkPreview,
} from '../../api/queries';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { Card, CardFooter } from '../../components/ui/card';
import { useT } from '../../i18n';
import { PageHeader } from '../../shell/PageHeader';
import { LoadError } from '../configuracao/ConfiguracaoPage';
import { Loading } from '../RouteStates';

const FAILURE_KEYS = {
  expired: 'chatLink.expired',
  not_member: 'chatLink.notMember',
  not_connected: 'chatLink.notConnected',
  mapped: 'chatLink.mapped',
} as const;

export function ChatLinkCard({
  view,
  pending,
  onLink,
}: {
  view: ChatLinkPreviewView | ChatLinkResultView;
  pending: boolean;
  onLink: () => void;
}) {
  const t = useT();
  const params = { login: view.login, org: view.org };
  if (view.status === 'confirm') {
    return (
      <Card>
        <p className="m-0">{t('chatLink.confirm', { ...params, account: view.account })}</p>
        {view.replaces ? <p className="m-0 text-muted">{t('chatLink.replaces', params)}</p> : null}
        <CardFooter>
          <Button
            type="button"
            disabled={pending}
            aria-busy={pending || undefined}
            onClick={onLink}
          >
            {t('chatLink.submit')}
          </Button>
          <Button asChild variant="outline">
            <Link to="/">{t('chatLink.cancel')}</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }
  if (view.status === 'linked') {
    return (
      <Card>
        <p role="status" className="m-0">
          {t('chatLink.linked', params)}
        </p>
      </Card>
    );
  }
  return (
    <Alert variant="warn">
      <AlertDescription>
        <p>{t(FAILURE_KEYS[view.status], params)}</p>
      </AlertDescription>
    </Alert>
  );
}

export function ChatLinkPage({ token }: { token: string }) {
  const t = useT();
  const preview = useChatLinkPreview(token);
  const link = useCompleteChatLink(token);
  const failure = preview.error ?? link.error;
  const body =
    failure instanceof ApiError && failure.status === 401 ? (
      <Loading header={false} />
    ) : failure ? (
      <LoadError
        header={false}
        onRetry={() => (link.isError ? link.mutate() : void preview.refetch())}
      />
    ) : preview.data ? (
      <ChatLinkCard
        view={link.data ?? preview.data}
        pending={link.isPending}
        onLink={() => link.mutate()}
      />
    ) : (
      <Loading header={false} />
    );
  return (
    <>
      <PageHeader title={t('chatLink.title')} />
      {body}
    </>
  );
}
