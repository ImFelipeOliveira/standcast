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
  await expect(page).toHaveURL(`/orgs/${INSTALLATION_ID}/settings`);
  await expect(page.getByRole('heading', { name: 'Configuração', level: 1 })).toBeVisible();
  await expect(page.getByText(TEAM_NAME).first()).toBeVisible();

  await page.getByRole('button', { name: 'Usar tema escuro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('the account page sets theme and language for this browser', async ({ page, context }) => {
  await signIn(context);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(`/orgs/${INSTALLATION_ID}/today?team=${TEAM_NAME}`);
  await page.getByRole('button', { name: 'Menu da conta de alice' }).click();
  await expect(page.getByRole('menuitem', { name: 'Read in English' })).toHaveCount(0);
  await page.getByRole('menuitem', { name: 'Conta' }).click();
  await expect(page).toHaveURL(`/orgs/${INSTALLATION_ID}/account`);
  await expect(page.getByRole('heading', { name: 'Conta', level: 1 })).toBeVisible();
  await expect(page.getByText('@alice')).toBeVisible();

  const theme = page.getByRole('group', { name: 'Tema' });
  await expect(theme.getByRole('radio', { name: 'Sistema' })).toBeChecked();
  await theme.getByText('Escuro').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await theme.getByText('Sistema').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => localStorage.getItem('standcast.theme'))).toBeNull();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.getByRole('group', { name: 'Idioma' }).getByText('English').click();
  await expect(page.getByRole('heading', { name: 'Account', level: 1 })).toBeVisible();
  await page.getByRole('group', { name: 'Language' }).getByText('Follow the browser').click();
  await expect(page.getByRole('heading', { name: 'Conta', level: 1 })).toBeVisible();

  await page.goto('/account');
  await expect(page).toHaveURL(`/orgs/${INSTALLATION_ID}/account`);
});

test('hoje shows the team blocker and who sent today', async ({ page, context }) => {
  await signIn(context);
  await page.goto(`/orgs/${INSTALLATION_ID}/today?team=${TEAM_NAME}`);
  await expect(page.getByRole('heading', { name: 'Precisa de você' })).toBeVisible();
  await expect(page.locator('article').filter({ hasText: BLOCKER_TEXT }).first()).toBeVisible();
  await expect(page.getByLabel('Resumo de hoje')).toContainText('1 de 2');
});

test('an anonymous visit lands on the sign-in page', async ({ page }) => {
  await page.goto(`/orgs/${INSTALLATION_ID}/today?team=${TEAM_NAME}`);
  await expect(page).toHaveURL(/\/sign-in\?next=/);
  await expect(page.getByRole('link', { name: 'Continuar com GitHub' })).toBeVisible();
});

test('a sign-in error shows a toast once and leaves the URL', async ({ page }) => {
  await page.goto('/sign-in?error=access_denied&next=%2Forgs%2F1%2Ftoday');
  await expect(page.getByRole('alert')).toContainText('Você cancelou o acesso no GitHub');
  await expect(page).toHaveURL(/\/sign-in\?next=%2Forgs%2F1%2Ftoday$/);
  await page.reload();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('the app serves its favicon', async ({ page }) => {
  await page.goto('/sign-in');
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/favicon.svg');
  const response = await page.request.get('/favicon.svg');
  expect(response.status()).toBe(200);
});

test('the phone drawer moves focus, closes with Escape and on team change', async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/orgs/${INSTALLATION_ID}/today?team=${TEAM_NAME}`);
  const menu = page.getByRole('button', { name: 'Abrir menu' });
  await menu.click();
  const drawer = page.getByRole('dialog', { name: 'Menu' });
  await expect(drawer).toBeVisible();
  await expect(drawer.locator(':focus')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(menu).toBeFocused();
  await menu.click();
  await page.getByRole('dialog', { name: 'Menu' }).getByRole('link', { name: TEAM_NAME }).click();
  await expect(page.getByRole('dialog', { name: 'Menu' })).toHaveCount(0);
});
