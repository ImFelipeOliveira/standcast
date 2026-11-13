import { useQueries, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useId, useState } from 'react';
import { orgContextQuery, useSession } from '../../api/queries';
import { Button } from '../../components/ui/button';
import { Card, CardDescription, CardTitle } from '../../components/ui/card';
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
import { followBrowserLang, type LangChoice, setLang, useLangChoice, useT } from '../../i18n';
import { cn } from '../../lib/utils';
import { useNavDrawer } from '../../shell/nav-drawer';
import { PageHeader } from '../../shell/PageHeader';
import { roleLabel } from '../../shell/roles';
import { signOut } from '../../shell/sign-out';
import { chooseTheme, followSystemTheme, type ThemeChoice, useThemeChoice } from '../../theme';

const GITHUB_PROFILE_URL = 'https://github.com/settings/profile';

type Option<T extends string> = { value: T; label: string; lang?: string };

function Segmented<T extends string>({
  legend,
  value,
  options,
  onChange,
}: {
  legend: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
}) {
  const name = useId();
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="mb-2 p-0 font-semibold text-[13px] text-text">{legend}</legend>
      <div className="flex w-fit max-w-full flex-wrap gap-1 rounded-lg bg-hover p-0.5">
        {options.map((option) => {
          const checked = option.value === value;
          return (
            <label
              key={option.value}
              lang={option.lang}
              className={cn(
                'relative inline-flex min-h-11 cursor-pointer items-center rounded-md px-3 font-medium text-[13px] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-mark has-[:focus-visible]:outline-offset-2 desk:min-h-8',
                checked
                  ? 'bg-surface font-semibold text-text ring-1 ring-border-strong'
                  : 'text-muted hover:text-text',
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function Profile() {
  const t = useT();
  const session = useSession();
  const installations = session.data?.installations ?? [];
  const contexts = useQueries({
    queries: installations.map((installation) => orgContextQuery(installation.id)),
  });
  if (!session.data) return null;
  const { login, avatarUrl } = session.data;
  return (
    <Card aria-labelledby="account-profile">
      <CardTitle id="account-profile">{t('account.profile')}</CardTitle>
      <div className="flex flex-wrap items-center gap-4">
        <img
          src={avatarUrl}
          alt=""
          width={56}
          height={56}
          className="size-14 flex-none rounded-full bg-accent-soft"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-mono font-semibold text-[15px]">@{login}</span>
          <CardDescription>{t('account.profileHint')}</CardDescription>
        </div>
        <Button asChild variant="outline">
          <a href={GITHUB_PROFILE_URL} target="_blank" rel="noreferrer">
            {t('account.editOnGitHub')}
            <span className="sr-only"> {t('account.newTab')}</span>
          </a>
        </Button>
      </div>
      {installations.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <h3 className="m-0 font-semibold text-[13px] text-text">{t('account.orgs')}</h3>
          <ul className="m-0 flex list-none flex-col p-0">
            {installations.map((installation, index) => {
              const context = contexts[index]?.data;
              return (
                <li
                  key={installation.id}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5 border-border border-b py-2.5 last:border-b-0"
                >
                  <span className="font-medium text-text">{installation.owner}</span>
                  {context ? (
                    <span className="font-mono text-[12px] text-muted">
                      {roleLabel(context, t)}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

function Preferences() {
  const t = useT();
  const lang = useLangChoice();
  const theme = useThemeChoice();
  return (
    <Card aria-labelledby="account-preferences">
      <div className="flex flex-col gap-0.5">
        <CardTitle id="account-preferences">{t('account.preferences')}</CardTitle>
        <CardDescription>{t('account.preferencesHint')}</CardDescription>
      </div>
      <Segmented<LangChoice>
        legend={t('lang.label')}
        value={lang}
        options={[
          { value: 'pt-BR', label: t('account.lang.pt'), lang: 'pt-BR' },
          { value: 'en', label: t('account.lang.en'), lang: 'en' },
          { value: 'browser', label: t('account.lang.browser') },
        ]}
        onChange={(next) => (next === 'browser' ? followBrowserLang() : setLang(next))}
      />
      <Segmented<ThemeChoice>
        legend={t('account.theme')}
        value={theme}
        options={[
          { value: 'light', label: t('account.theme.light') },
          { value: 'dark', label: t('account.theme.dark') },
          { value: 'system', label: t('account.theme.system') },
        ]}
        onChange={(next) => (next === 'system' ? followSystemTheme() : chooseTheme(next))}
      />
    </Card>
  );
}

function Sessions() {
  const t = useT();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const signOutEverywhere = async () => {
    setPending(true);
    setFailed(false);
    const ok = await signOut({
      queryClient,
      everywhere: true,
      goToSignedOut: () => navigate({ to: '/sign-in', search: { signed_out: 1 }, replace: true }),
    });
    if (!ok) {
      setPending(false);
      setFailed(true);
    }
  };
  return (
    <Card aria-labelledby="account-sessions">
      <div className="flex flex-col gap-0.5">
        <CardTitle id="account-sessions">{t('account.sessions')}</CardTitle>
        <CardDescription>{t('account.sessionsHint')}</CardDescription>
      </div>
      {failed ? (
        <p
          role="alert"
          className="m-0 rounded-[9px] border border-bad-line bg-bad-soft px-3 py-2 text-[13px] text-bad-ink2"
        >
          {t('account.signOutAll.failed')}
        </p>
      ) : null}
      <Dialog>
        <DialogTrigger asChild>
          <Button type="button" variant="destructive" className="w-fit" disabled={pending}>
            {t('account.signOutAll')}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('account.signOutAll.title')}</DialogTitle>
            <DialogDescription>{t('account.signOutAll.body')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t('setup.cancel')}
              </Button>
            </DialogClose>
            <DialogClose asChild>
              <Button type="button" disabled={pending} onClick={() => void signOutEverywhere()}>
                {t('account.signOutAll.confirm')}
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export function AccountPage() {
  const t = useT();
  const { inShell } = useNavDrawer();
  return (
    <>
      <PageHeader
        title={t('account.title')}
        actions={
          inShell ? null : (
            <Button asChild variant="outline">
              <Link to="/">{t('notFound.home')}</Link>
            </Button>
          )
        }
      />
      <div className="flex max-w-[760px] flex-col gap-4">
        <Profile />
        <Preferences />
        <Sessions />
      </div>
    </>
  );
}
