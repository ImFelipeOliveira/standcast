import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { markSignInStarted, type SignInError, signInUrl } from '../api/client';
import { Toast, ToastRegion, type ToastTone } from '../components/ui/toast';
import { type Lang, setLang, useLang, useT } from '../i18n';
import { docsUrl, INSTALL_URL, privacyUrl, SUPPORT_EMAIL, termsUrl } from '../lib/links';
import { Logo } from '../shell/Logo';
import { ThemeToggle } from '../shell/ThemeToggle';

const ERROR_TONES: Record<SignInError, ToastTone> = {
  access_denied: 'warning',
  invalid_state: 'warning',
  sign_in_did_not_stick: 'warning',
  unauthorized: 'error',
  generic: 'error',
};

type Notice = SignInError | 'signed_out';

function GitHubMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function Legal({ lang }: { lang: Lang }) {
  const t = useT();
  const [before, rest = ''] = t('signIn.legal').split('{terms}');
  const [middle, after = ''] = rest.split('{privacy}');
  const link =
    'text-muted underline decoration-border-strong underline-offset-[3px] hover:text-text';
  return (
    <>
      {before}
      <a className={link} href={termsUrl(lang)}>
        {t('signIn.terms')}
      </a>
      {middle}
      <a className={link} href={privacyUrl(lang)}>
        {t('signIn.privacy')}
      </a>
      {after}
    </>
  );
}

function Preview() {
  const t = useT();
  const row = 'flex justify-between gap-3 text-[13px] text-text2';
  return (
    <aside
      aria-hidden="true"
      className="hidden items-center justify-center border-0 border-border border-l border-solid bg-bg bg-[radial-gradient(var(--border)_1px,transparent_1px)] bg-size-[16px_16px] p-12 desk:flex"
    >
      <div className="flex w-full max-w-[440px] flex-col gap-4">
        <span className="font-semibold text-muted text-xs">{t('signIn.preview.label')}</span>
        <div className="overflow-hidden rounded-[10px] bg-surface shadow-[0_16px_40px_-12px_rgba(24,24,27,0.22)]">
          <div className="flex items-center justify-between gap-3 border-0 border-border border-b border-solid px-4 py-3.5">
            <span className="flex flex-col">
              <span className="font-semibold">{t('signIn.preview.title')}</span>
              <span className="font-mono text-muted text-xs">{t('signIn.preview.time')}</span>
            </span>
            <span className="font-semibold text-ok-ink text-xs">{t('signIn.preview.sent')}</span>
          </div>
          <div className="flex flex-col gap-2 border-0 border-border border-b border-solid px-4 py-3.5">
            <span className="font-semibold text-muted text-xs">{t('signIn.preview.blockers')}</span>
            <span className={row}>
              <span>
                <span className="mr-2 font-mono font-semibold text-amber-ink">3d</span>
                {t('signIn.preview.blocker')}
              </span>
              <span className="font-mono text-accent-text text-xs">api#8379</span>
            </span>
          </div>
          <div className="flex flex-col gap-2 px-4 py-3.5">
            <span className="font-semibold text-muted text-xs">{t('signIn.preview.shipped')}</span>
            <span className={row}>
              <span>{t('signIn.preview.item1')}</span>
              <span className="font-mono text-accent-text text-xs">api#8371</span>
            </span>
            <span className={row}>
              <span>{t('signIn.preview.item2')}</span>
              <span className="font-mono text-accent-text text-xs">BE-412</span>
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function SignIn({
  next,
  error,
  signedOut,
}: {
  next: string;
  error?: SignInError;
  signedOut: boolean;
}) {
  const t = useT();
  const lang = useLang();
  const navigate = useNavigate();
  const [notice, setNotice] = useState<Notice | null>(error ?? (signedOut ? 'signed_out' : null));

  useEffect(() => {
    if (!error && !signedOut) return;
    void navigate({
      to: '/sign-in',
      search: next === '/' ? {} : { next },
      replace: true,
    });
  }, [error, signedOut, next, navigate]);

  const github = signInUrl(next);
  return (
    <div className="grid min-h-screen grid-cols-1 bg-surface text-sm text-text desk:grid-cols-2">
      <main className="box-border flex min-h-screen flex-col px-4 py-6 desk:px-8">
        <header className="flex items-center gap-2">
          <Logo />
          <span className="ml-auto flex items-center gap-2">
            <label htmlFor="sign-in-lang" className="sr-only">
              {t('signIn.language')}
            </label>
            <select
              id="sign-in-lang"
              value={lang}
              onChange={(event) => setLang(event.target.value as Lang)}
              className="min-h-11 rounded-md border border-border-strong border-solid bg-surface px-2 font-medium text-base text-text2 desk:min-h-9 desk:text-[13px]"
            >
              <option value="pt-BR">Português</option>
              <option value="en">English</option>
            </select>
            <ThemeToggle />
          </span>
        </header>

        <div className="flex flex-1 items-center justify-center py-12">
          <div className="flex w-full max-w-[360px] flex-col gap-7">
            <div className="flex flex-col gap-2">
              <h1 className="m-0 font-semibold text-[28px] leading-tight tracking-[-0.02em]">
                {t('signIn.title')}
              </h1>
              <p className="m-0 text-[15px] text-muted">{t('signIn.subtitle')}</p>
            </div>
            <div className="flex flex-col gap-3">
              <a
                href={github}
                onClick={markSignInStarted}
                className="box-border flex min-h-11 w-full items-center justify-center gap-2.5 rounded-lg bg-text font-semibold text-[14px] text-bg no-underline hover:opacity-90"
              >
                <GitHubMark />
                {t('signIn.github')}
              </a>
              <p className="m-0 text-muted text-xs leading-relaxed">
                {t('signIn.why')} <Legal lang={lang} />
              </p>
            </div>
            <div className="flex flex-col gap-1 border-0 border-border border-t border-solid pt-5">
              <span className="font-semibold text-[13px]">{t('signIn.firstTime.title')}</span>
              <span className="text-[13px] text-muted">
                {t('signIn.firstTime.body')}{' '}
                <a className="text-accent-text underline underline-offset-[3px]" href={INSTALL_URL}>
                  {t('signIn.firstTime.install')}
                </a>
              </span>
            </div>
          </div>
        </div>

        <footer className="flex flex-wrap gap-4 text-muted text-xs">
          <a
            className="text-muted underline underline-offset-[3px] hover:text-text"
            href={docsUrl(lang)}
          >
            {t('signIn.docs')}
          </a>
          <a
            className="text-muted underline underline-offset-[3px] hover:text-text"
            href={`mailto:${SUPPORT_EMAIL}`}
          >
            {t('signIn.support')}
          </a>
        </footer>
      </main>

      <Preview />

      {notice ? (
        <ToastRegion>
          {notice === 'signed_out' ? (
            <Toast
              tone="neutral"
              title={t('signIn.signedOut')}
              dismissLabel={t('signIn.dismiss')}
              onDismiss={() => setNotice(null)}
            />
          ) : (
            <Toast
              tone={ERROR_TONES[notice]}
              title={t(`signIn.error.${notice}.title`)}
              description={t(`signIn.error.${notice}.body`)}
              dismissLabel={t('signIn.dismiss')}
              onDismiss={() => setNotice(null)}
              action={
                <a
                  href={github}
                  onClick={markSignInStarted}
                  className="inline-flex min-h-11 items-center rounded-md border border-border-strong border-solid px-2.5 font-semibold text-text text-xs no-underline hover:bg-hover desk:min-h-7"
                >
                  {t('signIn.retry')}
                </a>
              }
            />
          )}
        </ToastRegion>
      ) : null}
    </div>
  );
}
