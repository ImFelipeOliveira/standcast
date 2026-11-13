import { readFile } from 'node:fs/promises';
import { type BrowserContext, expect, test } from '@playwright/test';
import { INSTALLATION_ID, TEAM_NAME } from './seed';

async function signIn(context: BrowserContext): Promise<void> {
  const token = (await readFile('test-results/session-token', 'utf8')).trim();
  await context.addCookies([
    { name: 'sc_web', value: token, domain: 'localhost', path: '/', httpOnly: true, secure: true },
  ]);
}

test('going back after two searches shows the earlier query in the search field', async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.route(
    `**/v1/app/orgs/${INSTALLATION_ID}/teams/${TEAM_NAME}/history/search?**`,
    (route) => route.fulfill({ json: { results: [] } }),
  );
  await page.goto(`/orgs/${INSTALLATION_ID}/history?team=${TEAM_NAME}&tab=search`);
  const field = page.getByRole('searchbox', { name: 'Buscar nas dailies' });
  await field.fill('alpha');
  await field.press('Enter');
  await expect(page).toHaveURL(/q=alpha/);
  await field.fill('beta');
  await field.press('Enter');
  await expect(page).toHaveURL(/q=beta/);
  await page.goBack();
  await expect(page).toHaveURL(/q=alpha/);
  await expect(field).toHaveValue('alpha');
});

test('a refused clipboard write says so and points to the Markdown export', async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) },
    });
  });
  await page.route(
    `**/v1/app/orgs/${INSTALLATION_ID}/teams/${TEAM_NAME}/history/shipped**`,
    (route) => route.fulfill({ json: { from: '2026-11-02', to: '2026-11-08', days: [] } }),
  );
  await page.goto(`/orgs/${INSTALLATION_ID}/history?team=${TEAM_NAME}&tab=shipped`);
  await page.getByRole('button', { name: 'Copiar como markdown' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Não foi possível copiar' }),
  ).toContainText('Exportar Markdown');
  await expect(page.getByRole('button', { name: 'Copiado' })).toHaveCount(0);
});
