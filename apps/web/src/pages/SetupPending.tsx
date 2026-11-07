import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { useT } from '../i18n';

export function SetupPending({ installationId }: { installationId: number }) {
  const t = useT();
  return (
    <Card role="status" className="m-4 items-start">
      <h1 className="m-0 font-bold text-[17px]">{t('setup.pending.title')}</h1>
      <p className="m-0 text-text2">{t('setup.pending.body')}</p>
      <Button asChild variant="outline">
        <a href={`/setup?installation_id=${installationId}&resynced=1`}>
          {t('setup.pending.refresh')}
        </a>
      </Button>
    </Card>
  );
}
