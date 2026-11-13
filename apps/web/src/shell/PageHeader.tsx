import type { ReactNode } from 'react';
import { useT } from '../i18n';
import { useNavDrawer } from './nav-drawer';
import { useScrolled } from './scroll';

export function PageHeader({
  context,
  title,
  actions,
}: {
  context?: ReactNode;
  title: ReactNode;
  actions?: ReactNode;
}) {
  const scrolled = useScrolled();
  const drawer = useNavDrawer();
  const t = useT();
  return (
    <header
      data-scrolled={scrolled ? 'true' : 'false'}
      className="group sticky top-0 z-10 -mx-4 border-transparent border-b bg-bg px-4 transition-[border-color] duration-200 motion-reduce:transition-none data-[scrolled=true]:border-border desk:-mx-9 desk:px-9"
    >
      <div className="mx-auto flex min-h-16 max-w-[1180px] flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2.5 transition-[min-height,padding] duration-200 motion-reduce:transition-none group-data-[scrolled=true]:min-h-[52px] group-data-[scrolled=true]:py-1.5">
        <button
          type="button"
          aria-label={t('nav.openMenu')}
          aria-expanded={drawer.open}
          aria-controls="app-sidebar"
          id="app-menu-button"
          onClick={drawer.toggle}
          className="inline-flex size-11 flex-none cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-text2 hover:bg-hover desk:hidden"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <div className="flex min-w-0 flex-1 flex-col">
          {context ? (
            <p className="m-0 max-h-[18px] truncate font-mono text-[12px] text-muted opacity-100 transition-[max-height,opacity] duration-200 motion-reduce:transition-none group-data-[scrolled=true]:max-h-0 group-data-[scrolled=true]:opacity-0">
              {context}
            </p>
          ) : null}
          <h1 className="m-0 truncate font-semibold text-[20px] leading-[26px] tracking-[-0.015em] transition-[font-size] duration-200 motion-reduce:transition-none group-data-[scrolled=true]:text-[16px]">
            {title}
          </h1>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
