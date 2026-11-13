# Docs v2 (roadmap PR 13) Implementation Plan

**Goal:** The VitePress docs (`docs/site`, en and pt-BR) meet WCAG 2.2 AA in both themes, are grouped the way people look for them, and every page has its own link preview image.

**Spec:** row 13 of `docs/superpowers/specs/2026-11-12-panel-v2-roadmap-design.md` (branch `feat/web-sign-in-page`): dark brand token, underlined links, visible focus, sidebar Getting started / Members / Admin / API / Reference, code groups, local search, edit link, last updated, per page OG image. Stacked on PR 12 (`feat/brand-assets`), which brings the `og-docs` artboard.

## Decisions

- **Palette.** Light brand `#3446C2` (hover `#2F3CA8`), dark brand `#8B98F0` (hover `#A5AFF7`). Grays follow the panel: text `#18181B` / `#3F3F46` / `#5B5B66` light, `#EDEDEF` / `#C9C9CF` / `#A1A1AA` dark, on VitePress' own backgrounds (`#FFFFFF`, `#1B1B1F`). Brand buttons keep `#3446C2` with white text in both themes, because VitePress uses `--vp-c-brand-2` both as link hover color and as button hover background.
- **Code contrast is fixed at render time.** Shiki's GitHub themes have tokens under 4.5:1 on the code background (orange, green and red in light, comments in dark). A Shiki transformer moves each token color toward black (light) or white (dark) until it reaches 4.5:1 against the code block background, so no theme fork is needed.
- **Information architecture only moves sidebar entries.** No URL changes, so no redirects. The members page `members/getting-started` is renamed "Write your first daily" so that it does not repeat the "Getting started" group name; its URL stays.
- **OG images are rendered offline and committed.** Cloudflare Pages builds the docs without Chromium or `rsvg-convert`, so `docs:build` cannot draw images. `bun run docs:og` opens the `og-docs` artboard in Playwright's Chromium, fills `data-slot="section|title|path"` per page and writes `docs/site/public/og/<page>.<hash>.png`. The hash covers the template, its fonts and the page's section, title and path: unchanged pages are skipped and stale files removed. `transformHead` points `og:image` and `twitter:image` at the same hashed path, a test fails when an image is missing or stale, and the build fails when a page has no image. Screenshots are taken directly (no outlined SVG step), since the PNG is the only output.
- **Section label** comes from the sidebar group: DOCS (Getting started and Reference), MEMBERS / MEMBROS, ADMIN, API, and CHANGELOG for the changelog page.
- **"Copy page as Markdown" is left out.** `vitepress-plugin-llms` already publishes every page as `.md`; a button needs a custom component and a CSP review, which is not trivial.

## Tasks

1. **Tests first** (`bun test scripts/docs-*.test.ts`):
   - `docs-contrast.test.ts`: contrast math, the token adjuster, and every brand, text and code token pair parsed from `brand.css` at 4.5:1 (focus ring at 3:1); links in content underlined; focus ring 2px; tabs and copy button at least 24px.
   - `docs-theme-config.test.ts`: sidebar groups in the same order and with the same links in both languages, every page in exactly one group, search with pt-BR translations, edit link, last updated, outline `[2, 3]`, external link icon, pt-BR skip link.
   - `docs-og.test.ts`: title from frontmatter or h1, section per page, display path, stable hash, and a committed PNG of 1200×630 for every page with no stale files.
2. **Theme:** `brand.css` tokens, underline, focus ring, code group focus, target sizes.
3. **Config:** `scripts/docs-theme-config.ts` (sidebar, locale theme config), `scripts/docs-contrast.ts` (transformer), `config.mts` wiring, `lastUpdated`, `transformHead`.
4. **Code groups:** CLI install (script / manual), MCP clients (Claude Desktop, Cursor, VS Code, Codex), Slack channel (name / id), Google Chat versus Slack `chat` block, in both languages.
5. **OG:** `scripts/docs-og.ts`, `scripts/docs-og-render.ts`, `docs:og` script, render and commit.
6. **Changelog** (Unreleased / Não lançado), then `bun test`, `bun run lint`, `bun run typecheck`, `bun run check-docs`, `bun run docs:build`, and a WCAG pass in the browser in both themes.
