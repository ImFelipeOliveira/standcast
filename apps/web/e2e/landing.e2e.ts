import { existsSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { expect, type Page, test } from '@playwright/test';

const PUBLIC = join(import.meta.dirname, '../../landing/public');
const ORIGIN = 'http://landing.test';
const PAGES = ['/', '/pt-BR/', '/how-it-works/', '/pt-BR/como-funciona/'];
const WIDTHS = [320, 360, 390];

async function serveLanding(page: Page): Promise<void> {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN) return route.abort();
    const path = url.pathname.endsWith('/') ? `${url.pathname}index.html` : url.pathname;
    const file = normalize(join(PUBLIC, path));
    if (!file.startsWith(PUBLIC) || !existsSync(file)) return route.fulfill({ status: 404 });
    return route.fulfill({ path: file });
  });
}

for (const width of WIDTHS) {
  for (const path of PAGES) {
    test(`landing ${path} fits a ${width}px phone`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await serveLanding(page);
      await page.goto(`${ORIGIN}${path}`);
      await page.evaluate(() => document.fonts.ready);

      const beta = page.locator('header.nav .nav-end .btn-primary');
      await expect(beta).toBeVisible();
      const box = await beta.boundingBox();
      expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
      expect((box?.x ?? width) + (box?.width ?? 0)).toBeLessThanOrEqual(width);

      const overflow = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        footer: Math.max(
          0,
          ...[...document.querySelectorAll('footer.site-footer *')].map(
            (element) => element.getBoundingClientRect().right - window.innerWidth,
          ),
        ),
      }));
      expect(overflow.page).toBeLessThanOrEqual(0);
      expect(overflow.footer).toBeLessThanOrEqual(0);
    });
  }
}
