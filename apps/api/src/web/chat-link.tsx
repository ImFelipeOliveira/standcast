import { type MessageKey, t as translate } from '@standcast/core';
import type { ChatLinkPreview, ChatLinkResult } from '@standcast/orchestrator';
import { Layout } from './layout';
import { ButtonLink, Card, Icon, SubmitButton } from './ui';

const FAILURE_KEYS = {
  expired: 'web.chatLink.expired',
  not_member: 'web.chatLink.notMember',
  not_connected: 'web.chatLink.notConnected',
  mapped: 'web.chatLink.mapped',
  linked: 'web.chatLink.linked',
} as const;

export function ChatLinkPage(props: {
  view: ChatLinkPreview | ChatLinkResult;
  token?: string;
  csrf?: string;
}) {
  const { view } = props;
  const t = (key: MessageKey, params?: Record<string, string>) =>
    translate(view.language, key, params);
  const title = t('web.chatLink.title');
  const params = { login: view.login, org: view.org };
  return (
    <Layout lang={view.language} title={title}>
      <Card class="error-card">
        <span class="status-icon status-icon-neutral">
          <Icon name={view.status === 'linked' ? 'check' : 'alert'} />
        </span>
        <h1>{title}</h1>
        {view.status === 'confirm' ? (
          <form method="post" action="/link/google-chat">
            <input type="hidden" name="token" value={props.token ?? ''} />
            <input type="hidden" name="csrf" value={props.csrf ?? ''} />
            <p>{t('web.chatLink.confirm', { ...params, account: view.account })}</p>
            {view.replaces ? <p class="muted">{t('web.chatLink.replaces', params)}</p> : null}
            <p>
              <SubmitButton>{t('web.chatLink.submit')}</SubmitButton>{' '}
              <ButtonLink href="/" variant="secondary">
                {t('web.chatLink.cancel')}
              </ButtonLink>
            </p>
          </form>
        ) : (
          <p>{t(FAILURE_KEYS[view.status], params)}</p>
        )}
      </Card>
    </Layout>
  );
}
