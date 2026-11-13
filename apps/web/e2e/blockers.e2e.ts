import { readFile } from 'node:fs/promises';
import { type BrowserContext, expect, test } from '@playwright/test';
import { INSTALLATION_ID, TEAM_NAME } from './seed';

async function signIn(context: BrowserContext): Promise<void> {
  const token = (await readFile('test-results/session-token', 'utf8')).trim();
  await context.addCookies([
    { name: 'sc_web', value: token, domain: 'localhost', path: '/', httpOnly: true, secure: true },
  ]);
}

test('a failed reopen says so and clears on retry', async ({ page, context }) => {
  await signIn(context);
  await page.route(`**/v1/app/orgs/${INSTALLATION_ID}/blockers`, (route) =>
    route.fulfill({
      json: {
        open: [],
        resolved: [
          {
            id: '00000000-0000-4000-8000-000000000001',
            teams: [TEAM_NAME],
            author: 'alice',
            text: 'Aguardando a revisão do contrato',
            ref: null,
            resolvedOn: '2026-11-10',
            resolvedBy: 'alice',
            canResolve: true,
          },
        ],
      },
    }),
  );
  let attempts = 0;
  await page.route(`**/v1/app/orgs/${INSTALLATION_ID}/blockers/*/reopen`, (route) => {
    attempts += 1;
    return attempts === 1
      ? route.fulfill({ status: 500, json: { error: { code: 'internal', message: 'boom' } } })
      : route.fulfill({ status: 204 });
  });
  await page.goto(`/orgs/${INSTALLATION_ID}/blockers?state=resolved`);
  const failed = page
    .getByRole('alert')
    .filter({ hasText: 'Não foi possível atualizar o impedimento' });
  await page.getByRole('button', { name: 'Reabrir' }).click();
  await expect(failed).toBeVisible();
  const reopened = page.waitForResponse(
    (response) =>
      response.url().endsWith('/reopen') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Reabrir' }).click();
  expect((await reopened).status()).toBe(204);
  expect(attempts).toBe(2);
  await expect(failed).toBeHidden();
});
