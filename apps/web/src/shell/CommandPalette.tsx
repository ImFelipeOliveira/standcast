import { useNavigate } from '@tanstack/react-router';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { type KeyboardEvent, useEffect, useMemo, useState } from 'react';
import { type MessageKey, useT } from '../i18n';
import { cn } from '../lib/utils';
import { type PaletteGroup, type PaletteItem, paletteItems } from './palette-items';

const GROUP_LABELS: Record<PaletteGroup, MessageKey> = {
  screens: 'palette.screens',
  teams: 'palette.teams',
  search: 'palette.search',
};

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export function CommandPalette({
  installationId,
  teams,
  currentTeam,
}: {
  installationId: number;
  teams: string[];
  currentTeam: string | null;
}) {
  const t = useT();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const items = useMemo(
    () => paletteItems({ query, installationId, teams, currentTeam, t }),
    [query, installationId, teams, currentTeam, t],
  );

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setActive(0);
    }
  }, [open]);

  const choose = (item: PaletteItem | undefined) => {
    if (!item) return;
    setOpen(false);
    void navigate({ to: item.to, params: { installationId }, search: item.search ?? {} });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, items.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActive(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActive(Math.max(items.length - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(items[active]);
    }
  };

  const groups = (['screens', 'teams', 'search'] as const)
    .map((group) => ({ group, entries: items.filter((item) => item.group === group) }))
    .filter((entry) => entry.entries.length > 0);
  const optionId = (item: PaletteItem) => `palette-${item.id.replace(/[^\w-]/g, '_')}`;
  const activeItem = items[active];

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          aria-keyshortcuts="Meta+K Control+K"
          className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-[9px] border-0 bg-hover px-3 text-[13px] text-muted hover:text-text desk:min-h-9"
        >
          <span>{t('palette.open')}</span>
          <kbd className="font-mono text-[11px]">{isMac() ? '⌘K' : 'Ctrl K'}</kbd>
        </button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay" />
        <DialogPrimitive.Content
          aria-describedby="palette-hint"
          className="fixed top-[12vh] left-1/2 z-50 flex max-h-[70vh] w-[calc(100%-32px)] max-w-xl -translate-x-1/2 flex-col overflow-hidden rounded-[14px] bg-surface text-text shadow-xl ring-1 ring-border-strong"
        >
          <DialogPrimitive.Title className="sr-only">{t('palette.title')}</DialogPrimitive.Title>
          <input
            role="combobox"
            aria-label={t('palette.title')}
            aria-expanded="true"
            aria-controls="palette-list"
            aria-autocomplete="list"
            aria-activedescendant={activeItem ? optionId(activeItem) : undefined}
            placeholder={t('palette.placeholder')}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            className="min-h-12 w-full border-0 border-border border-b bg-transparent px-4 text-base text-text outline-none placeholder:text-muted"
          />
          <div
            id="palette-list"
            role="listbox"
            aria-label={t('palette.title')}
            className="overflow-y-auto p-2"
          >
            {groups.map(({ group, entries }) => (
              <div key={group} role="presentation" className="py-1">
                <div
                  aria-hidden="true"
                  className="px-2 py-1 font-semibold text-[11px] text-muted uppercase tracking-wide"
                >
                  {t(GROUP_LABELS[group])}
                </div>
                {entries.map((item) => {
                  const selected = item === activeItem;
                  return (
                    <div
                      key={item.id}
                      id={optionId(item)}
                      role="option"
                      aria-selected={selected}
                      tabIndex={-1}
                      onMouseMove={() => setActive(items.indexOf(item))}
                      onClick={() => choose(item)}
                      onKeyDown={() => undefined}
                      className={cn(
                        'flex min-h-11 cursor-pointer items-center rounded-md px-2 text-[14px] desk:min-h-9',
                        selected ? 'bg-hover font-semibold text-text' : 'text-text2',
                      )}
                    >
                      {item.label}
                    </div>
                  );
                })}
              </div>
            ))}
            {items.length === 0 ? (
              <p className="m-0 p-3 text-[13px] text-muted">{t('palette.empty')}</p>
            ) : null}
          </div>
          <p
            id="palette-hint"
            className="m-0 border-border border-t px-4 py-2 text-[12px] text-muted"
          >
            {t('palette.hint')}{' '}
            <span className="sr-only" aria-live="polite">
              {t('palette.results', { count: String(items.length) })}
            </span>
          </p>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
