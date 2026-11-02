import { signInUrl } from '../api/client';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { useLang, useT } from '../i18n';
import { docsUrl } from '../lib/links';
import { Logo } from '../shell/Logo';
import { ThemeToggle } from '../shell/ThemeToggle';

export function SignedOut() {
  const t = useT();
  const lang = useLang();
  return (
    <main className="mx-auto box-border flex min-h-screen max-w-xl flex-col gap-6 px-4 py-10 text-sm">
      <div className="flex items-center gap-2.5">
        <Logo />
        <ThemeToggle />
      </div>
      <Card className="items-start gap-4 p-6">
        <h1 className="m-0 font-bold text-[24px] leading-tight">{t('signedOut.title')}</h1>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <a href={signInUrl('/')}>{t('signedOut.signIn')}</a>
          </Button>
          <Button asChild variant="outline">
            <a href={docsUrl(lang)}>{t('signedOut.docs')}</a>
          </Button>
        </div>
      </Card>
    </main>
  );
}
