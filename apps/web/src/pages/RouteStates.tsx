import { type ErrorComponentProps, Link, useRouter } from '@tanstack/react-router';
import { ApiError } from '../api/client';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { useT } from '../i18n';

export function Loading() {
  const t = useT();
  return (
    <p role="status" className="m-0 p-6 text-muted">
      {t('app.loading')}
    </p>
  );
}

export function RouteError({ error }: ErrorComponentProps) {
  const t = useT();
  const router = useRouter();
  if (error instanceof ApiError && error.status === 401) return <Loading />;
  return (
    <Card role="alert" className="m-4 items-start">
      <h1 className="m-0 font-bold text-[17px]">{t('error.title')}</h1>
      <p className="m-0 text-text2">{t('error.body')}</p>
      <Button type="button" variant="outline" onClick={() => void router.invalidate()}>
        {t('error.retry')}
      </Button>
    </Card>
  );
}

export function NotFound() {
  const t = useT();
  return (
    <Card className="m-4 items-start">
      <h1 className="m-0 font-bold text-[17px]">{t('notFound.title')}</h1>
      <Button asChild variant="outline">
        <Link to="/">{t('notFound.home')}</Link>
      </Button>
    </Card>
  );
}
