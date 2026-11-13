# Landing v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship PR 11 of the panel v2 roadmap: rebuild the en and pt-BR home pages from the approved "Landing v2" artboard, move every landing page to the measured WCAG 2.2 AA palette and the new header and footer, and replace the WebGL wave with a calm 2D canvas pixel field that can be paused, freezes under reduced motion, stops offscreen and never draws faster than 30 fps.

**Architecture:** The landing stays static files in `apps/landing/public` served by the Cloudflare Worker. `styles.css` is rewritten around the new tokens and keeps the class names the inner pages already use. `app.js` keeps the copy button and adds four small, independent behaviours: the pixel field, the hero illustration, the "ways to write" tabs and the shrinking header. Without JavaScript every section is visible and every link works.

**Tech Stack:** Static HTML, CSS and vanilla JS, Bun test, Biome.

**Spec:** `docs/superpowers/specs/2026-11-12-panel-v2-roadmap-design.md`, row 11. Visual reference: the approved "Standcast — Landing v2" artboard.

## Global Constraints

- No comments in any code file.
- No inline `<script>` bodies other than JSON-LD, no `style=` attributes, no `on*=` handlers: the CSP is `script-src 'self'; style-src 'self'`.
- Fonts stay self-hosted. Saira 700 is copied from `apps/web/public/fonts` for the wordmark.
- Copy comes from the current landing. No new numbers, clients or testimonials.
- Every URL, `id` anchor, SEO tag, hreflang pair, JSON-LD block and markdown twin stays. Markdown twins follow any copy change.
- Palette: light bg `#FFFFFF`, surface `#F4F4F5`, text `#18181B`, text2 `#3F3F46`, muted `#5B5B66`, divider `#E7E7EA`, control `#8A8A96`, ink `#18181B`, accent text `#3446C2`, mark `#3B4BC8`. Dark bg `#0E0E10`, surface `#18181B`, text `#EDEDEF`, text2 `#C9C9CF`, muted `#A1A1AA`, divider `#2A2A30`, control `#6E6E78`, ink `#EDEDEF`, accent text `#A5AFF7`, mark `#8E9AF5`.
- Accessibility: skip link, landmarks, one `h1`, ordered headings, FAQ in `<details>`, 44px targets on phones, visible focus, links inside running text underlined.

## Files

- Modify: `apps/landing/public/index.html`, `apps/landing/public/pt-BR/index.html` (new sections)
- Modify: `apps/landing/public/index.md`, `apps/landing/public/pt-BR/index.md` (copy twins)
- Modify: every other `apps/landing/public/**/index.html` and both `404.html` (skip link, header, footer, theme color, no WebGL canvas)
- Rewrite: `apps/landing/public/styles.css`
- Rewrite: `apps/landing/public/app.js`
- Add: `apps/landing/public/fonts/saira-700-latin.3ea7fb14.woff2`
- Modify: `apps/landing/test/landing.test.ts`
- Modify: `docs/site/changelog.md`, `docs/site/pt-BR/changelog.md`

## Tasks

### Task 1: Failing tests for the v2 structure

- [ ] Add a `landing v2` describe block to `apps/landing/test/landing.test.ts`:
  - every page starts its body with a skip link to `#top`, and `main#top` exists
  - every page has exactly one `h1` and no heading skips a level
  - the home pages carry the same section ids in the same order in both languages: `top`, `how`, `features`, `ways`, `integrations`, `privacy`, `config`, `pricing`, `faq`, `beta`
  - the home FAQ uses `<details>` with a `<summary>` and links to the FAQ page
  - the home hero has one `canvas.field` with `aria-hidden="true"` and a `button.field-toggle` with `type="button"`, `aria-pressed="false"` and `hidden`, labelled "Pause animation" / "Pausar animação"
  - no page loads a WebGL field: no `canvas.hero-field`, and `app.js` has no `webgl`, `gl_FragColor` or `precision mediump`
  - `app.js` caps the field at 30 fps, uses `IntersectionObserver`, `visibilitychange` and `prefers-reduced-motion`
  - `styles.css` defines both palettes with the measured values and keeps a `:focus-visible` outline
  - the tabs markup has a `tablist` with one `tab` per panel and each panel has a heading, so it reads without JavaScript
  - every theme-color meta uses `#FFFFFF` and `#0E0E10`
- [ ] Run `bun test apps/landing` and watch the new tests fail.

### Task 2: Styles

- [ ] Rewrite `styles.css` with the new tokens (light, dark by media query, dark by `data-theme`), Saira for the wordmark, header and footer, the new home sections, and the inner page classes (`intro`, `crumbs`, `day`, `features`, `split`, `code`, `ways`, `faq`, `beta`, `form`, `band`, `privacy-grid`, `terms`, `missing`).
- [ ] Every `opacity: 0` stays inside `@media (prefers-reduced-motion: no-preference)` under a `.play` selector (existing test).
- [ ] Phones: buttons, tabs, the pause button and FAQ summaries reach 44px.

### Task 3: Pages

- [ ] Rebuild both home pages with the artboard sections, copy taken from the current home, how it works and FAQ pages.
- [ ] Apply the new header (skip link, mark, Saira wordmark, nav, language link, beta button) and footer (grouped links, support email, language link) to every page and both 404 pages; drop the WebGL canvases.
- [ ] Update both `index.md` twins.

### Task 4: Script

- [ ] Replace the WebGL field with the 2D pixel field: 4px dots on a 10px grid cached in an offscreen canvas; bars of 1 to 4 cells that light bottom to top 160ms apart and fade with `sin(pi * x)` over 3.2 to 4.4s; indigo from `--mark`; alpha capped at 0.10 on the left half and up to 0.32 on the right; at most 30 fps; stops when offscreen, when the document is hidden or when paused; reduced motion draws one still frame and keeps the pause button hidden.
- [ ] Pause button toggles `aria-pressed`, remembers the choice for the visitor and keeps the last frame.
- [ ] Hero illustration plays once: terminal lines one by one, digest card after about 2.5s; skipped under reduced motion.
- [ ] Tabs: arrow keys, Home and End, roving `tabindex`; without JavaScript the panels stay stacked and the tab list stays hidden.
- [ ] Header shrinks from 64px to 52px after 32px of scroll and grows back near the top.

### Task 5: Verify and ship

- [ ] `bun test`, `bun run lint`, `bun run typecheck`, `bun run check-docs`.
- [ ] Serve `apps/landing/public` locally and check both themes, phone width, keyboard focus, reduced motion and that no frames are requested while the hero is offscreen or paused.
- [ ] Changelog entry under Unreleased in en and pt-BR, then one PR to `dev`.
