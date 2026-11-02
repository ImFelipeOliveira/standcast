import { readFile } from 'node:fs/promises';
import { type BrowserContext, expect, test } from '@playwright/test';
import { BLOCKER_TEXT, INSTALLATION_ID, TEAM_NAME } from './seed';

async function signIn(context: BrowserContext): Promise<void> {
  const token = (await readFile('test-results/session-token', 'utf8')).trim();
  await context.addCookies([
    { name: 'sc_web', value: token, domain: 'localhost', path: '/', httpOnly: true, secure: true },
  ]);
}

test('setup route lands on Configuração and the theme toggles', async ({ page, context }) => {
  await signIn(context);

  await page.goto(`/setup?installation_id=${INSTALLATION_ID}`);
  await expect(page).toHaveURL(`/orgs/${INSTALLATION_ID}/configuracao`);
  await expect(page.getByRole('heading', { name: 'Configuração', level: 1 })).toBeVisible();
  await expect(page.getByText(TEAM_NAME).first()).toBeVisible();

  await page.getByRole('button', { name: 'Usar tema escuro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('hoje shows the team blocker and who sent today', async ({ page, context }) => {
  await signIn(context);
  await page.goto(`/orgs/${INSTALLATION_ID}/hoje?team=${TEAM_NAME}`);
  await expect(page.getByRole('heading', { name: 'Precisa de você' })).toBeVisible();
  await expect(page.locator('article').filter({ hasText: BLOCKER_TEXT }).first()).toBeVisible();
  await expect(page.getByLabel('Resumo de hoje')).toContainText('1 de 2');
});
