import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useOrgContext, useSession } from '../api/queries';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { useLang, useT } from '../i18n';
import { docsUrl } from '../lib/links';
import { roleLabel } from './roles';
import { signOut } from './sign-out';

export function SignOutError() {
  const t = useT();
  return (
    <p
      role="alert"
      className="m-0 mb-2 rounded-[9px] border border-bad-line bg-bad-soft px-3 py-2 text-[13px] text-bad-ink2"
    >
      {t('signOut.failed')}
    </p>
  );
}

export function UserMenu({ installationId }: { installationId: number }) {
  const t = useT();
  const lang = useLang();
  const session = useSession();
  const context = useOrgContext(installationId);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);
  if (!session.data) return null;
  const onSignOut = async () => {
    setFailed(false);
    const ok = await signOut({
      queryClient,
      goToSignedOut: () => navigate({ to: '/sign-in', search: { signed_out: 1 }, replace: true }),
    });
    if (!ok) setFailed(true);
  };
  const { login, avatarUrl } = session.data;
  return (
    <>
      {failed ? <SignOutError /> : null}
      <DropdownMenu>
        <DropdownMenuTrigger className="flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-[9px] border-0 bg-transparent px-2 py-2.5 text-left text-text hover:bg-hover">
          <span className="sr-only">{`${t('user.menu')}: `}</span>
          <img
            src={avatarUrl}
            alt=""
            width={32}
            height={32}
            className="size-8 flex-none rounded-full bg-accent-soft"
          />
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-semibold text-[13px]">{login}</span>
            {context.data ? (
              <span className="truncate font-mono text-muted text-xs">
                {roleLabel(context.data, t)}
              </span>
            ) : null}
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top">
          <DropdownMenuItem asChild>
            <Link to="/orgs/$installationId/account" params={{ installationId }}>
              {t('user.account')}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={docsUrl(lang)} target="_blank" rel="noreferrer">
              {t('user.docs')}
            </a>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void onSignOut()}>{t('user.signOut')}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
