import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { createDb, pruneRateLimits } from '@standcast/db';
import {
  BLOCKER_TEXT,
  INSTALLATION_ID,
  RESOLVED_BLOCKER_TEXT,
  SEARCH_TERM,
  TEAM_NAME,
  WEBHOOK_URL,
} from './seed';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('test database was not provisioned');
const db = createDb(databaseUrl);

test.beforeEach(() => pruneRateLimits(db, new Date(Date.now() + 60 * 60_000)));

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const BLOCKING = new Set(['serious', 'critical']);
const THEMES = ['light', 'dark'] as const;
const PHONE = { width: 390, height: 844 };

type Scenario = {
  name: string;
  path: string;
  signedIn: boolean;
  ready: (page: Page) => Promise<void>;
};

const org = `/orgs/${INSTALLATION_ID}`;
const team = encodeURIComponent(TEAM_NAME);

const visible = async (page: Page, text: string) => {
  await expect(page.getByRole('main').getByText(text).first()).toBeVisible();
};

const SCENARIOS: Scenario[] = [
  {
    name: 'sign-in',
    path: '/sign-in',
    signedIn: false,
    ready: (page) => expect(page.getByRole('link', { name: 'Continuar com GitHub' })).toBeVisible(),
  },
  {
    name: 'sign-in error toast',
    path: '/sign-in?error=access_denied',
    signedIn: false,
    ready: (page) =>
      expect(page.getByRole('alert')).toContainText('Você cancelou o acesso no GitHub'),
  },
  {
    name: 'today',
    path: `${org}/today?team=${team}`,
    signedIn: true,
    ready: (page) => visible(page, BLOCKER_TEXT),
  },
  {
    name: 'blockers open',
    path: `${org}/blockers`,
    signedIn: true,
    ready: (page) => visible(page, BLOCKER_TEXT),
  },
  {
    name: 'blockers resolved',
    path: `${org}/blockers?state=resolved`,
    signedIn: true,
    ready: (page) => visible(page, RESOLVED_BLOCKER_TEXT),
  },
  {
    name: 'history digests',
    path: `${org}/history?team=${team}`,
    signedIn: true,
    ready: async (page) => {
      await expect(page.getByRole('navigation', { name: 'Consolidados por dia' })).toBeVisible();
      await visible(page, 'Migrar o serviço de filas');
    },
  },
  {
    name: 'history search',
    path: `${org}/history?team=${team}&tab=search&q=${SEARCH_TERM}`,
    signedIn: true,
    ready: (page) => visible(page, 'Medir a latência das filas'),
  },
  {
    name: 'history shipped',
    path: `${org}/history?team=${team}&tab=shipped`,
    signedIn: true,
    ready: (page) => visible(page, 'Publiquei a nova fila de e-mails'),
  },
  {
    name: 'settings general',
    path: `${org}/settings`,
    signedIn: true,
    ready: (page) => visible(page, TEAM_NAME),
  },
  {
    name: 'settings people',
    path: `${org}/settings/people`,
    signedIn: true,
    ready: (page) => expect(page.getByRole('cell', { name: /bob/ }).first()).toBeVisible(),
  },
  {
    name: 'settings api',
    path: `${org}/settings/api`,
    signedIn: true,
    ready: async (page) => {
      await visible(page, 'Painel interno');
      await visible(page, WEBHOOK_URL);
    },
  },
];

async function signIn(context: BrowserContext): Promise<void> {
  const token = (await readFile('test-results/session-token', 'utf8')).trim();
  await context.addCookies([
    { name: 'sc_web', value: token, domain: 'localhost', path: '/', httpOnly: true, secure: true },
  ]);
}

async function useTheme(page: Page, theme: (typeof THEMES)[number]): Promise<void> {
  await page.emulateMedia({ colorScheme: theme });
  await page.addInitScript((value) => {
    localStorage.setItem('standcast.theme', value);
  }, theme);
}

type Violation = Awaited<ReturnType<AxeBuilder['analyze']>>['violations'][number];

function summarize(violations: Violation[]): string {
  return violations
    .map((violation) => {
      const targets = violation.nodes
        .map((node) => {
          const reason = node.failureSummary?.split('\n').slice(1).join(' ').trim() ?? '';
          return `    - ${node.target.join(' ')}${reason ? `\n      ${reason}` : ''}`;
        })
        .join('\n');
      return `  ${violation.id} [${violation.impact}] ${violation.help}\n    ${violation.helpUrl}\n${targets}`;
    })
    .join('\n');
}

async function expectAccessible(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const blocking = results.violations.filter((violation) => BLOCKING.has(violation.impact ?? ''));
  expect(
    blocking.length,
    `${label}: serious or critical axe violations\n${summarize(blocking)}\n`,
  ).toBe(0);
}

for (const theme of THEMES) {
  test.describe(`accessibility in the ${theme} theme`, () => {
    for (const scenario of SCENARIOS) {
      test(scenario.name, async ({ page, context }) => {
        if (scenario.signedIn) await signIn(context);
        await useTheme(page, theme);
        await page.goto(scenario.path);
        await scenario.ready(page);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expectAccessible(page, `${scenario.name} (${theme})`);
      });
    }

    for (const scenario of SCENARIOS) {
      test(`${scenario.name} on a phone`, async ({ page, context }) => {
        if (scenario.signedIn) await signIn(context);
        await useTheme(page, theme);
        await page.setViewportSize(PHONE);
        await page.goto(scenario.path);
        await scenario.ready(page);
        await expectAccessible(page, `${scenario.name} on a phone (${theme})`);
        if (!scenario.signedIn) return;
        await page.getByRole('button', { name: 'Abrir menu' }).click();
        await expect(page.getByRole('dialog', { name: 'Menu' })).toBeVisible();
        await expectAccessible(page, `${scenario.name} on a phone with the drawer open (${theme})`);
      });
    }
  });
}
