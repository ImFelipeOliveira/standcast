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

test('hoje shows the team blocker and who sent today', async ({ page, context }) => {
  await signIn(context);
  await page.goto(`/orgs/${INSTALLATION_ID}/today?team=${TEAM_NAME}`);
  await expect(page.getByRole('heading', { name: 'Precisa de você' })).toBeVisible();
  await expect(page.locator('article').filter({ hasText: BLOCKER_TEXT }).first()).toBeVisible();
  await expect(page.getByLabel('Resumo de hoje')).toContainText('1 de 2');
});

test('admins move between settings tabs and redeliver a failed webhook', async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto(`/orgs/${INSTALLATION_ID}/configuracao?connected=slack`);
  await expect(page).toHaveURL(`/orgs/${INSTALLATION_ID}/settings?connected=slack`);
  const tabs = page.getByRole('navigation', { name: 'Seções da configuração' });
  await expect(tabs.locator('[aria-current="page"]')).toHaveText(['Geral']);

  await tabs.getByRole('link', { name: 'Pessoas e vínculos' }).click();
  await expect(page).toHaveURL(`/orgs/${INSTALLATION_ID}/settings/people`);
  await expect(tabs.locator('[aria-current="page"]')).toHaveText(['Pessoas e vínculos']);
  await expect(page.getByRole('cell', { name: '@alice' })).toBeVisible();

  await tabs.getByRole('link', { name: 'API e webhooks' }).click();
  await expect(page).toHaveURL(`/orgs/${INSTALLATION_ID}/settings/api`);
  await expect(tabs.locator('[aria-current="page"]')).toHaveText(['API e webhooks']);
  const redeliver = page.getByRole('button', { name: 'Reenviar' });

  await page.route('**/redeliver', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: '{"error":{"code":"internal","message":"boom"}}',
    }),
  );
  await redeliver.click();
  await expect(page.getByRole('alert')).toContainText('Não foi possível concluir agora');

  await page.unroute('**/redeliver');
  await redeliver.click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Entrega colocada na fila de novo.' }),
  ).toBeVisible();
  await expect(redeliver).toHaveCount(0);
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

test('admins type the team in the standcast.yml editor and see it validated', async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto(`/orgs/${INSTALLATION_ID}/settings/config`);
  const tabs = page.getByRole('navigation', { name: 'Seções da configuração' });
  await expect(tabs.locator('[aria-current="page"]')).toHaveText(['standcast.yml']);
  const yaml = page.locator('pre');
  await expect(yaml).toContainText('members: [alice, bob]');

  const members = page.getByLabel('Membros', { exact: true });
  await members.fill('');
  await members.pressSequentially('alice, bob carol');
  await expect(members).toHaveValue('alice, bob carol');
  await expect(yaml).toContainText('members: [alice, bob, carol]');

  const channel = page.getByLabel('Canal', { exact: true });
  await channel.fill('#plataforma-x');
  await page.getByRole('button', { name: 'Slack', exact: true }).click();
  await expect(channel).toHaveValue('#plataforma-x');
  await expect(yaml).toContainText('channel: "#plataforma-x"');

  await expect(page.getByRole('status').filter({ hasText: 'Válido' })).toBeVisible();
});

test('widening past the desk breakpoint closes the phone drawer and frees the page', async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/orgs/${INSTALLATION_ID}/today?team=${TEAM_NAME}`);
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await expect(page.getByRole('dialog', { name: 'Menu' })).toBeVisible();
  await expect(page.locator('main')).toHaveAttribute('inert', '');
  await page.setViewportSize({ width: 1280, height: 844 });
  await expect(page.locator('main')).not.toHaveAttribute('inert', /.*/);
  await expect(page.getByRole('dialog', { name: 'Menu' })).toHaveCount(0);
});
