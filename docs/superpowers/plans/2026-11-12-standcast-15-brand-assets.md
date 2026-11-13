# Brand assets and README (roadmap PR 12) Implementation Plan

**Goal:** Every image Standcast publishes outside the product comes from an SVG source in `docs/marketplace/brand/`, is rendered at the exact size of its destination, and the README opens with a light/dark banner, at most four badges and the quick start before the features.

**Spec:** row 12 of `docs/superpowers/specs/2026-11-12-panel-v2-roadmap-design.md` (branch `feat/web-sign-in-page`). Visual source of truth: the "Standcast — Brand kit" artboards (`Main`, `GhLogo`, `GhFeature`, `GwBanner`, `Icons`, `Social`, `OgLanding`, `OgDocs`, `ReadmeLight`, `ReadmeDark`, `Shot1`–`Shot5`).

## Decisions

- **Text is outlined.** `rsvg-convert` on macOS renders text through CoreText and ignores the repository fonts, and GitHub shows the README banner as an image where web fonts never load. Every SVG source therefore carries its text as glyph paths, so it renders the same in `rsvg-convert`, in a browser and on GitHub, with no network and no installed fonts.
- **How text is outlined.** The artboards with text are kept as small HTML files in `docs/marketplace/brand/html/` that load Inter, JetBrains Mono and Saira from `apps/web/public/fonts`. `scripts/brand/build.ts` opens each one in Playwright's Chromium, reads the boxes and inline SVG from the DOM, prints the text layer to PDF and converts it with `pdftocairo -svg`, then writes a clean SVG: shapes, patterns and the bar mark as plain SVG, glyphs as `<use>` of shared paths. Chromium is the only engine available that handles the variable Inter and JetBrains Mono weights; fontkit 2.0.4 cannot apply variations to WOFF2 glyphs.
- **Text-free sources are hand written.** The icon tiles, the GitHub Marketplace logo, the apple-touch icon and the favicons have no text, so their SVGs are edited by hand.
- **PNGs come from the SVGs** with `rsvg-convert`, as before. Screenshots stay HTML mocks in `docs/marketplace/mock/`, rendered by Playwright at 1280×800.
- **README banner is transparent**, so it sits on GitHub's own light or dark background.
- **The landing keeps its current `og.png`, favicon links and meta tags.** Landing v2 (PR 11) decides where the new OG images go; this PR only publishes them under `/brand/`. `favicon.png` stays a byte copy of `logo-96.png`, as the landing test requires.
- **README links "GitHub App", not "Marketplace".** The GitHub Marketplace listing does not exist yet (`github.com/marketplace/standcast` answers 404) and the Google Workspace listing is not approved.
- **GitHub Marketplace copy follows the kit,** with one fact fixed: the GitHub App has `checks: write` (it posts the `Standcast config` check run) and reads `standcast.yml` and `CODEOWNERS`, so the detailed description says so instead of "read-only access to checks".

## Tasks

1. **Test first.** `scripts/brand-assets.test.ts` asserts, from the files on disk:
   - each PNG's width and height from its IHDR header, for the landing brand files, `apple-touch-icon-180.png`, the GitHub Marketplace logo, feature card, social preview, both OG images and the five screenshots;
   - every SVG source exists, declares the same size as its PNG, has no `<text>` and loads nothing external;
   - `favicon.svg` switches color under `prefers-color-scheme: dark`;
   - the README has a `<picture>` with a dark and a light `<source>` pointing at the SVG banners, an `<img>` of width 700 with a descriptive alt, at most four badges, all with `labelColor=18181b`, and the quick start before the features;
   - the GitHub Marketplace copy in `docs/marketplace/listing.md` is within GitHub's limits (40–80, 150–250, up to 1000 characters).
   Run it and watch it fail.
2. **Hand-written SVGs:** `logo-square.svg` (tile), `logo-avatar.svg` (256, safe in a circle), `apple-touch-icon.svg`, `github-marketplace-logo.svg` (white bars, transparent), `favicon.svg` (light and dark), `favicon-16.svg` (pixel drawn).
3. **HTML artboards and build script:** `docs/marketplace/brand/html/{banner,feature-card,social-preview,og-landing,og-landing-en,og-docs,readme-light,readme-dark}.html`, `scripts/brand/html-to-svg.ts`, `scripts/brand/build.ts`.
4. **Screenshots:** five mocks in `docs/marketplace/mock/`, replacing the three old screenshots and the old Google Chat mock.
5. **Render** with `bun scripts/brand/build.ts` and check each PNG by eye against the kit.
6. **README:** `<picture>` banner, one line of links, four badges, quick start moved before features. Facts unchanged.
7. **Listing:** asset table, render commands, GitHub Marketplace section with the copy and badge color `#3B4BC8`.
8. **Changelog** entry under Unreleased (en and pt-BR), `bun test`, `bun run lint`, `bun run typecheck`, `bun run check-docs`, self-review, PR to `dev`.

## Out of scope

- Generating one OG image per docs page (PR 13 uses `og-docs.svg` as its template).
- Pointing the landing meta tags at the new OG images (PR 11).
- `favicon.ico`.
