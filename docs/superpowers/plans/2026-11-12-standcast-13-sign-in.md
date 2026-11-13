# Sign-in page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The web app gets its own GitHub sign-in page, every sign-in failure comes back to it as a toast, app URLs move to English, and the app serves a favicon.

**Architecture:** The API's OAuth callback redirects failures of app logins to `APP_URL/sign-in?error=<code>&next=<path>` instead of rendering HTML. The SPA sends every 401 to `/sign-in?next=` (never straight to GitHub); the page holds the "Continue with GitHub" button that calls the existing `/auth/github/login?target=app`. Routes `hoje`, `historico`, `configuracao` become `today`, `history`, `settings` with redirects from the old paths.

**Tech Stack:** Bun, Hono (api), React 19, TanStack Router and Query, Tailwind v4, shadcn-style components on `radix-ui` 1.8.1, bun:test, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-12-panel-v2-roadmap-design.md` (PR 1) and the panel artifact boards "Sign in" and "Sign in · erro em toast".

## Global Constraints

- Error codes in URLs: `access_denied`, `invalid_state`, `unauthorized`, `sign_in_did_not_stick`, `generic`.
- `next` is a relative path; anything starting with `//`, `/\`, `/sign-in` or not starting with `/` becomes `/`.
- Logins started by API pages (`target` other than `app`) keep the current HTML error page.
- Copy in pt-BR and en, product tone; no code comments.
- Deploy the web app before the API: the API starts redirecting to `/sign-in` and `/settings`.
- Every new string goes into both `apps/web/src/i18n/pt-BR.ts` and `en.ts` (the i18n test checks parity).

## Review Focus

1. A 401 while already on `/sign-in` must not redirect again (the page uses `skipAuthRedirect`) — test in Task 3.
2. A signed-in person opening `/sign-in` goes to `next`, not the form — test in Task 5.
3. The error toast shows once: after it renders, `error` leaves the URL, so a refresh shows no toast — test in Task 5.
4. Old bookmarks keep their query: `/orgs/11/hoje?team=core` → `/orgs/11/today?team=core` — test in Task 4.
5. A user who cancels on GitHub and comes back must not be treated as "sign-in did not stick" on the next 401 — the page clears the sign-in marker when it mounts with an error — test in Task 5.

---

### Task 1: API sends failed app logins back to the app sign-in

Already implemented in the worktree; this task commits it.

**Files:**
- Modify: `packages/orchestrator/src/modules/session/start-web-login.ts` (adds `readLoginState`)
- Modify: `apps/api/src/routes/web.tsx` (callback catch, `appSignIn`)
- Test: `packages/orchestrator/test/use-cases/web-login.test.ts`, `apps/api/test/web.test.ts`

**Interfaces:**
- Produces: `readLoginState(deps: Deps, state: string | undefined): { next: string; target: 'api' | 'app' } | null`

- [ ] **Step 1: Run the tests**

Run: `bun test apps/api/test/web.test.ts packages/orchestrator/test/use-cases/web-login.test.ts`
Expected: 77 pass, 0 fail (covers tampered state, nonce mismatch, `access_denied` with and without state, unexpected failure → `generic`, API-started login keeps the 400 HTML page).

- [ ] **Step 2: Commit**

```bash
git add packages/orchestrator apps/api
git commit -m "feat(api): send failed app sign-ins back to the app with an error code"
```

### Task 2: API connect callbacks land on `/settings`

**Files:**
- Modify: `apps/api/src/routes/web.tsx` (the two `…/configuracao?connected=` redirects)
- Test: `apps/api/test/web.test.ts:598`, `:651`

- [ ] **Step 1: Change the expectations** to `https://app.test/orgs/${INST}/settings?connected=slack` and `…?connected=linear`; also change the three `'/orgs/11/hoje'` `next` values in the sign-in tests to `'/orgs/11/today'`.
- [ ] **Step 2: Run** `bun test apps/api/test/web.test.ts` — Expected: the two connect tests FAIL.
- [ ] **Step 3: Point both redirects at `/orgs/${id}/settings?connected=<provider>`.**
- [ ] **Step 4: Run** the same command — Expected: all pass.
- [ ] **Step 5: Commit** `fix(api): land connect callbacks on the English settings route`.

### Task 3: Web client sends 401s to the sign-in page

**Files:**
- Modify: `apps/web/src/api/client.ts`
- Modify: `apps/web/src/pages/RouteStates.tsx`, `apps/web/src/pages/hoje/HojePage.tsx`, `apps/web/src/pages/configuracao/ConfiguracaoPage.tsx` (remove `SignInStuck` / `isSignInStuck`)
- Test: `apps/web/src/api/client.test.ts`, `apps/web/src/shell/shell.test.tsx` (drop the `SignInStuck` render test)

**Interfaces:**
- Produces, in `client.ts`:
  - `export const SIGN_IN_PATH = '/sign-in'`
  - `export type SignInError = 'access_denied' | 'invalid_state' | 'unauthorized' | 'sign_in_did_not_stick' | 'generic'`
  - `export function safeNext(next: unknown): string`
  - `export function signInPagePath(next: string, error?: SignInError): string` → `/sign-in`, `/sign-in?next=%2Forgs%2F11%2Ftoday`, `/sign-in?error=generic&next=…` (`next` omitted when it is `/`)
  - `export function markSignInStarted(): void` — writes the marker; the page's GitHub link calls it on click and then navigates to `signInUrl(next)` normally
  - `export function clearSignInMarker(): void` (now exported)
- Removes: `isSignInStuck`, `retrySignIn`, `SIGN_IN_DID_NOT_STICK` (replaced by the `SignInError` value).

- [ ] **Step 1: Rewrite the redirect tests**

```ts
test('401 sends the browser to the sign-in page with next', async () => {
  const assigned = stubWindow('/orgs/11/settings');
  stubFetch(unauthorized);
  await expect(apiGet('/v1/app/orgs/11/setup')).rejects.toBeInstanceOf(ApiError);
  expect(assigned).toEqual(['/sign-in?next=%2Forgs%2F11%2Fsettings']);
});

test('401 within a minute of starting GitHub sign-in reports that it did not stick', async () => {
  const assigned = stubWindow('/orgs/11/today', '?team=core');
  storage.setItem(SIGN_IN_MARKER, String(Date.now()));
  stubFetch(unauthorized);
  await expect(apiGet('/v1/app/session')).rejects.toBeInstanceOf(ApiError);
  expect(assigned).toEqual([
    '/sign-in?error=sign_in_did_not_stick&next=%2Forgs%2F11%2Ftoday%3Fteam%3Dcore',
  ]);
  expect(storage.getItem(SIGN_IN_MARKER)).toBeNull();
});

test('401 on the sign-in page does not redirect', async () => {
  const assigned = stubWindow('/sign-in');
  stubFetch(unauthorized);
  await expect(apiGet('/v1/app/session')).rejects.toBeInstanceOf(ApiError);
  expect(assigned).toEqual([]);
});

test('marking the sign-in start writes the marker', () => {
  stubWindow('/sign-in');
  markSignInStarted();
  expect(storage.getItem(SIGN_IN_MARKER)).not.toBeNull();
});

test('safeNext keeps relative paths only', () => {
  for (const bad of ['https://evil.test', '//evil.test', '/\\evil.test', 'evil', '/sign-in?next=/x', 42]) {
    expect(safeNext(bad)).toBe('/');
  }
  expect(safeNext('/orgs/11/today?team=core')).toBe('/orgs/11/today?team=core');
});
```

Delete the old "second 401 stops redirecting", "try again clears the marker" tests; keep "a working session clears the marker", "logout with an expired session does not redirect" and "a broken sessionStorage still redirects" (its expectation becomes two `/sign-in?next=…` entries).

- [ ] **Step 2: Run** `bun test apps/web/src/api/client.test.ts` — Expected: FAIL (`markSignInStarted` not exported).
- [ ] **Step 3: Implement** in `client.ts`: on 401 without `skipAuthRedirect`, if `window.location.pathname !== SIGN_IN_PATH`, compute `stuck` from the marker window (60 s), clear the marker, `window.location.assign(signInPagePath(currentPathAndSearch(), stuck ? 'sign_in_did_not_stick' : undefined))`; always throw the `ApiError`.
- [ ] **Step 4: Remove** `SignInStuck` and every `isSignInStuck` branch; `RouteError` keeps `Loading` for 401.
- [ ] **Step 5: Run** `bun test apps/web` — Expected: all pass.
- [ ] **Step 6: Commit** `feat(web): send unauthenticated visits to the sign-in page`.

### Task 4: English routes with redirects from the old ones

**Files:**
- Modify: `apps/web/src/router.tsx`, `apps/web/src/shell/sections.ts`, `apps/web/src/shell/AppShell.tsx`, `apps/web/src/setup-route.test.tsx`, `apps/web/src/shell/shell.test.tsx`, `apps/web/e2e/smoke.e2e.ts`

**Interfaces:**
- Produces: `SECTIONS = ['today', 'history', 'settings'] as const`; `SECTION_PATHS = { today: '/orgs/$installationId/today', history: '/orgs/$installationId/history', settings: '/orgs/$installationId/settings' }`; `SECTION_LABELS` keys renamed; `SOON_SECTIONS = new Set(['history'])`.

- [ ] **Step 1: Update tests**: every `/orgs/11/hoje` → `/today`, `/historico` → `/history`, `/configuracao` → `/settings` in `shell.test.tsx`, `setup-route.test.tsx` and the e2e smoke; add

```ts
test('old Portuguese URLs redirect and keep the query', async () => {
  const today = await renderAt('/orgs/11/hoje?team=backend');
  expect(today.router.state.location.href).toBe('/orgs/11/today?team=backend');
  const settings = await renderAt('/orgs/11/configuracao?connected=slack');
  expect(settings.router.state.location.href).toBe('/orgs/11/settings?connected=slack');
  const history = await renderAt('/orgs/11/historico');
  expect(history.router.state.location.pathname).toBe('/orgs/11/history');
});
```

- [ ] **Step 2: Run** `bun test apps/web/src/shell apps/web/src/setup-route.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Rename** the three child routes and add three child routes `hoje`, `historico`, `configuracao` whose `beforeLoad` throws `redirect({ to: <new path>, params, search, replace: true })`, passing the validated search through.
- [ ] **Step 4: Run** the same command — Expected: pass.
- [ ] **Step 5: Commit** `feat(web): move app routes to English and redirect the old paths`.

### Task 5: Sign-in page with toast

**Files:**
- Create: `apps/web/src/components/ui/toast.tsx`
- Create: `apps/web/src/pages/SignIn.tsx`
- Create: `apps/web/src/pages/sign-in.test.tsx`
- Delete: `apps/web/src/pages/SignedOut.tsx`
- Modify: `apps/web/src/router.tsx` (route `/sign-in`; `/signed-out` redirects to `/sign-in?signed_out=1`), `apps/web/src/shell/UserMenu.tsx` (sign out goes to `/sign-in?signed_out=1`), `apps/web/src/lib/links.ts`, `apps/web/src/i18n/pt-BR.ts`, `apps/web/src/i18n/en.ts`

**Interfaces:**
- Consumes: `safeNext`, `signInUrl`, `markSignInStarted`, `clearSignInMarker`, `fetchSession(options)`, `SignInError` (Task 3).
- Produces:
  - `toast.tsx`: `ToastProvider`, `ToastViewport`, `Toast`, `ToastTitle`, `ToastDescription`, `ToastAction`, `ToastClose`, thin wrappers over `Toast` from `radix-ui`; viewport fixed bottom-right (16px inset on phones), surface background, shadow, no border.
  - `SignIn({ next, error, signedOut }: { next: string; error?: SignInError; signedOut: boolean })`.
  - Route search: `{ next?: string; error?: SignInError; signed_out?: '1' }`; unknown `error` values are dropped.
  - `links.ts`: `LANDING_URL = 'https://standcast.app'`, `termsUrl(lang)` → `/pt-BR/termos/` or `/terms/`, `privacyUrl(lang)` → `/pt-BR/privacidade/` or `/privacy/`, `SUPPORT_EMAIL = 'support@standcast.app'`.

Copy (pt-BR / en):

| Key | pt-BR | en |
|---|---|---|
| `signIn.title` | Entrar no Standcast | Sign in to Standcast |
| `signIn.subtitle` | As dailies do time, os impedimentos em aberto e o que foi entregue, num lugar só. | Your team's dailies, open blockers and what shipped, in one place. |
| `signIn.github` | Continuar com GitHub | Continue with GitHub |
| `signIn.why` | Usamos sua conta do GitHub só para saber quem você é e de quais organizações e times você faz parte. | We use your GitHub account only to know who you are and which organizations and teams you belong to. |
| `signIn.legal` | Ao continuar, você concorda com os {terms} e a {privacy}. | By continuing, you agree to the {terms} and the {privacy}. |
| `signIn.terms` | Termos | Terms |
| `signIn.privacy` | Privacidade | Privacy Policy |
| `signIn.firstTime.title` | Primeira vez por aqui? | First time here? |
| `signIn.firstTime.body` | Uma pessoa admin instala o app do GitHub na organização e o time entra com a própria conta. | An admin installs the GitHub app on the organization, and the team signs in with their own accounts. |
| `signIn.firstTime.install` | Instalar o Standcast | Install Standcast |
| `signIn.docs` | Documentação | Documentation |
| `signIn.support` | Suporte | Support |
| `signIn.retry` | Tentar de novo | Try again |
| `signIn.dismiss` | Fechar aviso | Dismiss |
| `signIn.error.access_denied.title` | Você cancelou o acesso no GitHub | You cancelled on GitHub |
| `signIn.error.access_denied.body` | Para entrar, autorize o Standcast quando o GitHub pedir. | To sign in, authorize Standcast when GitHub asks. |
| `signIn.error.invalid_state.title` | O link de login expirou | The sign-in link expired |
| `signIn.error.invalid_state.body` | Isso acontece depois de 10 minutos ou quando o login começa em outra aba. | This happens after 10 minutes or when sign-in starts in another tab. |
| `signIn.error.unauthorized.title` | O GitHub não confirmou sua conta | GitHub did not confirm your account |
| `signIn.error.unauthorized.body` | Tente de novo. Se continuar, fale com o suporte. | Try again. If it keeps happening, contact support. |
| `signIn.error.sign_in_did_not_stick.title` | O navegador não guardou a sessão | Your browser did not keep the session |
| `signIn.error.sign_in_did_not_stick.body` | Libere cookies para este site e tente de novo. | Allow cookies for this site and try again. |
| `signIn.error.generic.title` | Não conseguimos concluir o login | We could not finish signing in |
| `signIn.error.generic.body` | Tente de novo em instantes. | Try again in a moment. |
| `signIn.signedOut` | Você saiu do Standcast. | You signed out of Standcast. |

Remove the `signedOut.*` and `signInStuck.*` keys.

Layout (from the "Sign in" board): two columns at ≥ 900px; left holds the mark and wordmark, language select and theme toggle at the top, a 360px column with title (28px/600), subtitle, the full-width 44px ink link styled as a button with the GitHub mark (`<a href={signInUrl(next)} onClick={markSignInStarted}>`), the `why` and `legal` line (12px muted, underlined links), a divider and the first-time block, and footer links; right is a decorative panel (`aria-hidden`, hidden below 900px) with the sample digest from the board. `legal` interpolates two `<a>` elements; split the translated string on `{terms}` and `{privacy}`.

- [ ] **Step 1: Write `sign-in.test.tsx`**

```ts
test('renders the GitHub link that starts sign-in with next', async () => {
  const { html } = await renderAt('/sign-in?next=%2Forgs%2F11%2Ftoday', { session: 401 });
  expect(html).toContain('Continuar com GitHub');
  expect(html).toContain(`href="${signInUrl('/orgs/11/today').replaceAll('&', '&amp;')}"`);
});

test('a signed-in visit goes to next', async () => {
  const { router } = await renderAt('/sign-in?next=%2Forgs%2F11%2Ftoday', { session: 200 });
  expect(router.state.location.pathname).toBe('/orgs/11/today');
});

for (const code of ['access_denied', 'invalid_state', 'unauthorized', 'sign_in_did_not_stick', 'generic'] as const) {
  test(`error ${code} shows its toast and leaves the URL`, async () => {
    const { container, router } = await mountAt(`/sign-in?error=${code}&next=%2F`, { session: 401 });
    expect(container.querySelector('[role="status"], [role="alert"]')?.textContent)
      .toContain(translate('pt-BR', `signIn.error.${code}.title`));
    expect(router.state.location.search).not.toHaveProperty('error');
  });
}

test('an error clears the sign-in marker', async () => {
  sessionStorage.setItem(SIGN_IN_MARKER, String(Date.now()));
  await mountAt('/sign-in?error=access_denied', { session: 401 });
  expect(sessionStorage.getItem(SIGN_IN_MARKER)).toBeNull();
});

test('signed_out shows the signed-out toast without retry', async () => {
  const { container } = await mountAt('/sign-in?signed_out=1', { session: 401 });
  expect(container.textContent).toContain('Você saiu do Standcast.');
  expect(container.textContent).not.toContain('Tentar de novo');
});

test('/signed-out redirects to the sign-in page', async () => {
  const { router } = await renderAt('/signed-out', { session: 401 });
  expect(router.state.location.href).toBe('/sign-in?signed_out=1');
});
```

Use the existing render helpers in `shell.test.tsx` as the model for `renderAt`/`mountAt` (a stubbed `fetch` answering `/v1/app/session` with 200 or 401).

- [ ] **Step 2: Run** `bun test apps/web/src/pages/sign-in.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Build** `toast.tsx`, `SignIn.tsx`, the route (its `beforeLoad` calls `fetchSession({ skipAuthRedirect: true })` and, on success, redirects to `safeNext(search.next)`), the `/signed-out` redirect and the copy.
- [ ] **Step 4: Run** `bun test apps/web` — Expected: all pass, including the i18n parity test.
- [ ] **Step 5: Commit** `feat(web): add the GitHub sign-in page with error toasts`.

### Task 6: Favicon, e2e and checks

**Files:**
- Create: `apps/web/public/favicon.svg` (copy of `apps/landing/public/favicon.svg`), `apps/web/public/favicon.png` (copy of `apps/landing/public/favicon.png`)
- Modify: `apps/web/index.html` (`<link rel="icon" href="/favicon.svg" type="image/svg+xml">`, `<link rel="alternate icon" href="/favicon.png" type="image/png">`), `apps/web/e2e/smoke.e2e.ts`

- [ ] **Step 1: Add an e2e test**

```ts
test('an anonymous visit lands on the sign-in page', async ({ page }) => {
  await page.goto(`/orgs/${INSTALLATION_ID}/today?team=${TEAM_NAME}`);
  await expect(page).toHaveURL(/\/sign-in\?next=/);
  await expect(page.getByRole('link', { name: 'Continuar com GitHub' })).toBeVisible();
});
```

- [ ] **Step 2: Add the favicon files and links.**
- [ ] **Step 3: Run** `bun run --cwd apps/web test:e2e`, `bun run lint`, `bun run typecheck`, `bun test` — Expected: all green.
- [ ] **Step 4: Commit** `feat(web): serve the Standcast favicon`.
- [ ] **Step 5: Open the PR to `dev`** with the deploy note: web first, then API.
