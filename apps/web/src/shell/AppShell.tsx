import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { useSession } from '../api/queries';
import { Sidebar } from './Sidebar';
import { SECTION_PATHS, sectionOf } from './sections';

export function AppShell({ installationId }: { installationId: number }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const search = useRouterState({ select: (state) => state.location.search });
  const session = useSession();
  const section = sectionOf(pathname);
  return (
    <div className="flex min-h-screen flex-wrap text-sm leading-normal">
      <Sidebar
        installations={session.data?.installations ?? []}
        installationId={installationId}
        section={section}
        team={section === 'today' && typeof search.team === 'string' ? search.team : null}
        onOrgChange={(next) =>
          void navigate({ to: SECTION_PATHS[section], params: { installationId: next } })
        }
      />
      <main className="box-border min-w-0 flex-[999_1_640px] px-4 pt-6 pb-12 desk:px-9 desk:pt-8">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
