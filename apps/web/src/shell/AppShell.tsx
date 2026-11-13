import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '../api/queries';
import { DESKTOP_QUERY, watchDesktop } from './desktop';
import { NavDrawerContext } from './nav-drawer';
import { Sidebar } from './Sidebar';
import { SECTION_PATHS, sectionOf } from './sections';

export function AppShell({ installationId }: { installationId: number }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const search = useRouterState({ select: (state) => state.location.search });
  const session = useSession();
  const section = sectionOf(pathname);
  const href = useRouterState({ select: (state) => state.location.href });
  const [open, setOpen] = useState(false);
  const restoreFocusRef = useRef(false);
  useEffect(() => {
    if (href) setOpen(false);
  }, [href]);
  useEffect(() => watchDesktop(window.matchMedia(DESKTOP_QUERY), () => setOpen(false)), []);
  useEffect(() => {
    if (open || !restoreFocusRef.current) return;
    restoreFocusRef.current = false;
    document.getElementById('app-menu-button')?.focus();
  }, [open]);
  const drawer = useMemo(
    () => ({
      inShell: true,
      open,
      toggle: () => setOpen((value) => !value),
      close: (restoreFocus = false) => {
        restoreFocusRef.current = restoreFocus;
        setOpen(false);
      },
    }),
    [open],
  );
  return (
    <NavDrawerContext.Provider value={drawer}>
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
        <main
          inert={open || undefined}
          className="box-border min-w-0 flex-[999_1_640px] px-4 pb-12 desk:px-9"
        >
          <div className="mx-auto flex max-w-[1180px] flex-col gap-6">
            <Outlet />
          </div>
        </main>
      </div>
    </NavDrawerContext.Provider>
  );
}
