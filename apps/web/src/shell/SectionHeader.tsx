import { useRouterState } from '@tanstack/react-router';
import { useT } from '../i18n';
import { useNavDrawer } from './nav-drawer';
import { PageHeader } from './PageHeader';
import { PAGE_LABELS, sectionOf } from './sections';

export function SectionHeader() {
  const t = useT();
  const { inShell } = useNavDrawer();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  if (!inShell) return null;
  return <PageHeader title={t(PAGE_LABELS[sectionOf(pathname)])} />;
}
