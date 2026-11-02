import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { INSTALLATION_ID, TEAM_NAME } from './seed';

test('setup route lands on Configuração and the theme toggles', async ({ page, context }) => {
  const token = (await readFile('test-results/session-token', 'utf8')).trim();
  await context.addCookies([
    { name: 'sc_web', value: token, domain: 'localhost', path: '/', httpOnly: true, secure: true },
  ]);

  await page.goto(`/setup?installation_id=${INSTALLATION_ID}`);
  await expect(page).toHaveURL(`/orgs/${INSTALLATION_ID}/configuracao`);
  await expect(page.getByRole('heading', { name: 'Configuração', level: 1 })).toBeVisible();
  await expect(page.getByText(TEAM_NAME).first()).toBeVisible();

  await page.getByRole('button', { name: 'Usar tema escuro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
