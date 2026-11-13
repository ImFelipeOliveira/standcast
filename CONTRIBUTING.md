# Contributing

## Commits

Use Conventional Commits: `feat:`, `fix:`, `perf:`, `docs:`, `refactor:`, `ci:`, `chore:`. Mark breaking changes with `!` or a `BREAKING CHANGE:` footer.

## Releases

Releases are automatic. release-please watches `main` and keeps a release PR open with the next version and changelog. Merging that PR tags the release and uploads the CLI binaries and `SHA256SUMS` to it.

If a release ends up without its binaries, run the workflow by hand with the release tag once the fix is on `main`: `gh workflow run release-please.yml -f tag=standcast-vX.Y.Z`. That run only checks out the tag, builds the CLI and uploads the binaries and `SHA256SUMS` to the existing release, replacing any that are there. It does not run release-please. Re-running the whole push run does not help, because release-please finds the release already created and skips the upload.

The product changelogs (`docs/site/changelog.md` and `docs/site/pt-BR/changelog.md`) and the API changelog (`docs/api/CHANGELOG.md`) are written by hand, and they stay separate. A product change goes under `Unreleased` / `Não lançado` in the two site files. A public API contract change goes under `Unreleased` in the API file. A pull request that changes both writes one bullet in each place. When release-please opens or updates the release PR, the `release-changelogs` job runs `bun scripts/release-changelogs.ts` on the release branch, which adds the `<version> — <date>` heading under `Unreleased` in all three files, and pushes it with the `RELEASE_PLEASE_TOKEN` secret (a fine-grained token with Contents: write on this repository) so CI runs on that commit. Notes that were under `Unreleased` stay under that heading. The job does not write a product note. A change a person can see needs its bullet before the pull request merges, in both languages; a fix a person cannot see can release with the product section empty. If the API changelog has no notes, that version gets one line, `No public API changes.` You can run the script yourself on the release branch if the job did not. `bun run check-docs` fails when the version in `package.json` is missing a dated heading in any one of the three changelogs.

After every push to `main` (a `dev` merge or a release) or `dev`, the sync-dev workflow opens a `main` to `dev` pull request and merges it with a merge commit once `check` passes, so `dev` never falls behind `main`. Never squash that pull request: squashing leaves `main`'s commits out of `dev`.

Release PRs are opened with the default `GITHUB_TOKEN`, which does not trigger CI by itself. The commit the `release-changelogs` job pushes with `RELEASE_PLEASE_TOKEN` does trigger `pull_request` CI, so the checks run on their own. Only when that job pushes nothing (the headings were already there) or `RELEASE_PLEASE_TOKEN` is not set, close and reopen the PR or push an empty commit to it to run the checks.

The repository setting "Allow GitHub Actions to create and approve pull requests" must be enabled for release-please to open its PR.

## Running tests locally

```sh
bun install
bun test
```

Keep Docker. Testcontainers starts one disposable PostgreSQL 17 for the complete test run and removes it after the last test. Set `TEST_DATABASE_URL` when you want to use an existing database instead.

Also run `bun run lint` and `bun run typecheck` before opening a PR.

## Documentation link preview images

Every page of the documentation site (`docs/site`) has its own link preview image, committed under `docs/site/public/og`. The file name carries a hash of the page's title, sidebar section and path and of the `og-docs` template, so changing a page's title, adding a page or editing `docs/marketplace/brand/html/og-docs.html` needs new images. `bun test` and `bun run docs:build` fail until they exist, and the error names the page. Render them with Playwright's Chromium and commit the result:

```sh
bunx playwright install chromium
bun run docs:og
git add docs/site/public/og
```

`docs:og` renders only the missing images and removes the ones no page uses.

## Code style

Do not write comments in code. Make names and structure carry the meaning.

## Review guide

The patterns, code smells and past bugs reviewers look for are in [docs/engineering/review-guide.md](docs/engineering/review-guide.md). CodeRabbit reads it too (see `.coderabbit.yaml`).
