# Panel foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every panel screen uses the measured WCAG palette, borderless cards and dot status badges, with a sticky header that shrinks on scroll and a sidebar that becomes a drawer on phones.

**Architecture:** Token values change in `apps/web/src/styles.css` (names stay, so screens restyle without markup churn); a contrast test parses both theme blocks. A `PageHeader` component owns the sticky header and its scroll state; `AppShell` owns the drawer state and shares it through context.

**Tech Stack:** React 19, TanStack Router, Tailwind v4, bun:test (SSR rendering).

**Spec:** `docs/superpowers/specs/2026-11-12-panel-v2-roadmap-design.md` (Palette section, PR 2) and the panel artifact.

## Global Constraints

- Palette values exactly as in the spec's Palette section; primary fill is ink, indigo only for links, focus and the mark.
- Text ≥ 4.5:1; control borders (`--border-strong`) and focus ≥ 3:1 against surface and bg.
- Header: 64px, shrinks to 52px after 32px of scroll, grows back at ≤ 2px; context line fades; title 20px → 16px; no motion under `prefers-reduced-motion`.
- Drawer below 900px (`desk` breakpoint), opened by a menu button in the header, closed by the scrim or a nav link.
- Inputs and selects use 16px text on phones (no iOS zoom), 13px from `desk`.

## Review Focus

1. Scrolling right at the threshold must not make the header flicker (hysteresis) — unit test in Task 3.
2. Dark theme keeps every pair passing — the contrast test covers both blocks.
3. The drawer must not trap the page when closed: hidden from tab order (`hidden`), not just off-screen — test in Task 4.
4. Status still readable without color: badges keep their text; the dot is decoration (`aria-hidden` pseudo-element).
5. Pages that render their own `h1` must not end up with two (`PageHeader` owns the only `h1`) — test in Task 3.

---

### Task 1: Measured palette and contrast test

**Files:** Create `apps/web/src/palette.test.ts`; Modify `apps/web/src/styles.css` (`:root`, `:root[data-theme="dark"]`, `:focus-visible` uses `--mark`).

- [ ] Test `contrast(a, b)` (WCAG relative luminance) for both blocks: text/surface, text/bg, text2/surface, muted/surface, muted/bg, muted/hover ≥ 4.5; accent-text/surface ≥ 4.5; on-accent/accent ≥ 4.5; amber-ink, bad-ink, ok-ink, warn-ink on surface ≥ 4.5; border-strong/surface and border-strong/bg ≥ 3; mark/surface ≥ 3. RED today (border-strong `#d9dce3`).
- [ ] Set the values (light: bg `#f4f4f5`, surface `#ffffff`, text `#18181b`, text2 `#3f3f46`, muted `#5b5b66`, border `#e7e7ea`, border-strong `#8a8a96`, hover `#ebebed`, accent `#18181b`, accent-hover `#3f3f46`, on-accent `#ffffff`, accent-text `#3446c2`, amber/warn-ink `#9a4a00`, bad-ink `#b42318`, ok-ink `#11703f`, mark `#3b4bc8`; soft/wash/line tokens become neutral or transparent; dark per spec). GREEN.
- [ ] Commit `feat(web): measured WCAG palette for the panel`.

### Task 2: Borderless cards and dot badges

**Files:** Modify `components/ui/card.tsx` (no border, radius 10px), `components/ui/badge.tsx` (`ok`/`warn`/`bad` become transparent with a `before:` dot in `currentColor`), `components/ui/button.tsx` (`destructive`: surface background, `border-border-strong`, `text-bad-ink`), `shell/Sidebar.tsx` (current nav item: `bg-hover text-text font-semibold`, not an accent fill), `components/ui/select.tsx`, `components/ui/input.tsx`, `pages/SignIn.tsx` language select (`text-base desk:text-[13px]`). Test: `apps/web/src/components/ui/ui.test.tsx`.

- [ ] Tests: Card markup has no `border-border`; `Badge variant="ok"` has `before:` dot classes and no `bg-ok-soft`; select/input carry `text-base` and `desk:text-[13px]`. RED → implement → GREEN.
- [ ] Commit `feat(web): borderless cards and dot status badges`.

### Task 3: Sticky header that shrinks

**Files:** Create `shell/PageHeader.tsx` (`PageHeader({ context, title, actions, children })`), `shell/scroll.ts` (`nextScrolled(previous: boolean, y: number): boolean` → true above 32, false at ≤ 2, otherwise previous; `useScrolled(): boolean`), Modify `pages/hoje/HojePage.tsx`, `pages/configuracao/ConfiguracaoPage.tsx`, `pages/ComingSoon.tsx` to use it. Test: `shell/page-header.test.tsx`.

- [ ] Tests: `nextScrolled` table (false,10→false; false,33→true; true,10→true; true,2→false); PageHeader SSR has `sticky top-0`, `data-scrolled="false"`, one `h1`; Today and Settings pages render exactly one `<h1`.
- [ ] Implement (scroll listener passive, rAF throttled; CSS transitions on min-height/padding/font-size, disabled with `motion-reduce:transition-none`). GREEN.
- [ ] Commit `feat(web): sticky page header that shrinks on scroll`.

### Task 4: Drawer on phones

**Files:** Create `shell/nav-drawer.tsx` (`NavDrawerContext`, `useNavDrawer(): { open: boolean; toggle(): void; close(): void }`), Modify `shell/AppShell.tsx` (provider; close on route change), `shell/Sidebar.tsx` (`hidden desk:flex` unless open → fixed drawer `w-[min(280px,85vw)]`, plus scrim button), `shell/PageHeader.tsx` (menu button `desk:hidden`, `aria-expanded`, `aria-controls="app-sidebar"`), i18n `nav.openMenu` / `nav.closeMenu`. Test: `shell/shell.test.tsx`.

- [ ] Tests: header has the menu button with `aria-expanded="false"` and `aria-controls="app-sidebar"`; sidebar has `id="app-sidebar"` and `hidden` + `desk:flex` when closed. RED → implement → GREEN.
- [ ] Run `bun test`, `bun run lint`, `bun run typecheck`, web e2e; commit `feat(web): sidebar drawer on phones`; changelog entry; PR stacked on `feat/web-sign-in-page`.
