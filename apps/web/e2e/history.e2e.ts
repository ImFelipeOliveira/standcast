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
