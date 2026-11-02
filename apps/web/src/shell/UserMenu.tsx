import { apiPost, forgetSession } from '../api/client';
import { useOrgContext, useSession } from '../api/queries';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { setLang, useLang, useT } from '../i18n';
import { docsUrl } from '../lib/links';
import { roleLabel } from './roles';

async function signOut(): Promise<void> {
  await apiPost<void>('/v1/app/logout').catch(() => undefined);
  forgetSession();
  window.location.reload();
}

export function UserMenu({ installationId }: { installationId: number }) {
  const t = useT();
  const lang = useLang();
  const session = useSession();
  const context = useOrgContext(installationId);
  if (!session.data) return null;
  const { login, avatarUrl } = session.data;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('user.menu', { login })}
        className="flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-[9px] border-0 bg-transparent px-2 py-2.5 text-left text-text hover:bg-hover"
      >
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
          <a href={docsUrl(lang)} target="_blank" rel="noreferrer">
            {t('user.docs')}
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem
          lang={lang === 'pt-BR' ? 'en' : 'pt-BR'}
          onSelect={() => setLang(lang === 'pt-BR' ? 'en' : 'pt-BR')}
        >
          {t('lang.switch')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>{t('user.signOut')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
