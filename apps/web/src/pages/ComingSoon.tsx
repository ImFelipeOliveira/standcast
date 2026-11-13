import { Link } from '@tanstack/react-router';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { useT } from '../i18n';
import { SECTION_LABELS, type Section } from '../shell/sections';

export function ComingSoon({
  section,
  installationId,
}: {
  section: Section;
  installationId: number;
}) {
  const t = useT();
  const title = t(SECTION_LABELS[section]);
  return (
    <>
      <h1 className="m-0 font-bold text-[30px] leading-tight tracking-[-0.01em]">{title}</h1>
      <Card className="items-start">
        <h2 className="m-0 font-bold text-[17px]">{t('comingSoon.title', { section: title })}</h2>
        <p className="m-0 text-text2">{t('comingSoon.body')}</p>
        <Button asChild variant="outline">
          <Link to="/orgs/$installationId/settings" params={{ installationId }}>
            {t('comingSoon.cta')}
          </Link>
        </Button>
      </Card>
    </>
  );
}
