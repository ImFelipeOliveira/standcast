import { describe, expect, test } from 'bun:test';
import { type Language, type MessageKey, t } from '@standcast/core';
import { ErrorPage } from '../src/web/error';
import { PAGE_CSS } from '../src/web/layout';
import {
  Alert,
  Badge,
  ButtonLink,
  Card,
  Code,
  Icon,
  ScrollTable,
  StepStatus,
  SubmitButton,
} from '../src/web/ui';

const render = async (node: unknown) => String(await (node as { toString(): unknown }).toString());

const TOKENS = ['--background', '--foreground', '--primary', '--border', '--muted-foreground'];

function block(css: string, pattern: RegExp): Record<string, string> {
  const body = pattern.exec(css)?.[1] ?? '';
  const tokens: Record<string, string> = {};
  for (const match of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    tokens[match[1] as string] = (match[2] as string).trim();
  }
  return tokens;
}

const light = () => block(PAGE_CSS, /^:root\s*\{([^}]*)\}/m);
const dark = () =>
  block(PAGE_CSS, /@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([^}]*)\}/);

function luminance(hex: string): number {
  const value = /^#([0-9a-f]{6})$/i.exec(hex)?.[1];
  if (!value) throw new Error(`not a hex color: ${hex}`);
  const channels = [0, 2, 4].map((i) => {
    const c = Number.parseInt(value.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const [r, g, b] = channels as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT_PAIRS: [string, string][] = [
  ['--foreground', '--background'],
  ['--foreground', '--card'],
  ['--muted-foreground', '--card'],
  ['--muted-foreground', '--background'],
  ['--primary', '--card'],
  ['--primary-foreground', '--primary'],
  ['--primary-foreground', '--primary-hover'],
  ['--danger-foreground', '--danger'],
  ['--success-text', '--success-bg'],
  ['--warning-text', '--warning-bg'],
  ['--danger-text', '--danger-bg'],
  ['--info-text', '--info-bg'],
  ['--neutral-text', '--neutral-bg'],
  ['--muted-foreground', '--muted'],
];

describe('beta badge', () => {
  test('the header marks the product as beta on every page', () => {
    const html = String(<ErrorPage lang="en" code="not_found" supportEmail="help@example.com" />);
    expect(html).toContain('topbar-beta');
    expect(html).toContain('>Beta<');
  });
});

describe('design tokens', () => {
  test('the light palette defines the core tokens with the global constraint colors', () => {
    const tokens = light();
    for (const name of TOKENS) expect(tokens[name]).toBeDefined();
    expect(tokens['--background']).toBe('#F8FAFC');
    expect(tokens['--card']).toBe('#FFFFFF');
    expect(tokens['--foreground']).toBe('#0F172A');
    expect(tokens['--muted-foreground']).toBe('#475569');
    expect(tokens['--border']).toBe('#E2E8F0');
    expect(tokens['--primary']).toBe('#3B4BC8');
    expect(tokens['--primary-hover']).toBe('#2A3796');
    expect(tokens['--success']).toBe('#16A34A');
    expect(tokens['--danger']).toBe('#B91C1C');
    expect(tokens['--step-todo']).toBe('#64748B');
  });

  test('a dark block redefines every core token', () => {
    expect(PAGE_CSS).toContain('prefers-color-scheme: dark');
    const tokens = dark();
    for (const name of TOKENS) expect(tokens[name]).toBeDefined();
    expect(tokens['--background']).toBe('#0B1120');
    expect(tokens['--card']).toBe('#111827');
    expect(tokens['--foreground']).toBe('#E2E8F0');
    expect(tokens['--border']).toBe('#273449');
    const colors = Object.entries(light()).filter(([, value]) => value.startsWith('#'));
    for (const [name] of colors) expect(tokens[name]).toMatch(/^#[0-9A-F]{6}$/);
  });

  for (const [mode, read] of [
    ['light', light],
    ['dark', dark],
  ] as const) {
    test(`the ${mode} palette meets 4.5:1 for every text pair`, () => {
      const tokens = read();
      for (const [fg, bg] of TEXT_PAIRS) {
        const ratio = contrast(tokens[fg] ?? '', tokens[bg] ?? '');
        if (ratio < 4.5) throw new Error(`${mode} ${fg} on ${bg} is ${ratio.toFixed(2)}:1`);
      }
    });
  }

  test('components and rules use tokens, and the css loads nothing external', () => {
    const rules = PAGE_CSS.replace(/:root\s*\{[^}]*\}/g, '');
    expect(rules).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(PAGE_CSS).not.toMatch(/url\(|@import|https?:/);
    expect(PAGE_CSS).not.toContain('/*');
  });

  test('the layout utilities, focus ring and touch targets exist', () => {
    for (const selector of ['.stack', '.row', '.grid-2', '.page', '.layout']) {
      expect(PAGE_CSS).toContain(`${selector} {`);
    }
    expect(PAGE_CSS).toContain('max-width: 1120px');
    expect(PAGE_CSS).toContain('overflow-wrap: anywhere');
    expect(PAGE_CSS).toContain('outline: 2px solid var(--ring)');
    expect(PAGE_CSS).toContain('min-height: 36px');
    expect(PAGE_CSS).toContain('min-height: 44px');
    expect(PAGE_CSS).toContain('@media (max-width: 639px)');
    expect(PAGE_CSS).toContain('@media (max-width: 899px)');
  });
});

describe('component kit', () => {
  test('Card renders a section with its class and tone', async () => {
    expect(await render(<Card>x</Card>)).toBe('<section class="card">x</section>');
    const html = await render(
      <Card tone="warning" class="extra" as="aside">
        y
      </Card>,
    );
    expect(html).toBe('<aside class="card card-warning extra">y</aside>');
    expect(await render(<Card as="article">z</Card>)).toBe('<article class="card">z</article>');
  });

  test('Badge carries its tone', async () => {
    for (const tone of ['neutral', 'success', 'danger'] as const) {
      expect(await render(<Badge tone={tone}>ok</Badge>)).toBe(
        `<span class="badge badge-${tone}">ok</span>`,
      );
    }
  });

  test('ButtonLink and SubmitButton default to primary and accept a variant', async () => {
    expect(await render(<ButtonLink href="/go">Go</ButtonLink>)).toBe(
      '<a class="btn btn-primary" href="/go">Go</a>',
    );
    expect(
      await render(
        <ButtonLink href="/x" variant="secondary">
          X
        </ButtonLink>,
      ),
    ).toContain('class="btn btn-secondary"');
    expect(await render(<SubmitButton>Save</SubmitButton>)).toBe(
      '<button type="submit" class="btn btn-primary">Save</button>',
    );
    expect(await render(<SubmitButton variant="danger">Del</SubmitButton>)).toContain(
      'class="btn btn-danger"',
    );
  });

  test('Alert renders its tone, title, body and action', async () => {
    const html = await render(
      <Alert tone="danger" title="Broken" action={<a href="/fix">Fix</a>}>
        Details
      </Alert>,
    );
    expect(html).toContain('class="alert alert-danger"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('<strong class="alert-title">Broken</strong>');
    expect(html).toContain('<div class="alert-body">Details</div>');
    expect(html).toContain('<div class="alert-action"><a href="/fix">Fix</a></div>');
    expect(html).toContain('<svg');
    const info = await render(<Alert tone="info" title="FYI" />);
    expect(info).toContain('class="alert alert-info"');
    expect(info).toContain('role="status"');
    expect(info).not.toContain('alert-body');
    expect(info).not.toContain('alert-action');
    expect(await render(<Alert tone="warning" title="W" />)).toContain('alert-warning');
    const urgent = await render(<Alert tone="info" role="alert" title="Secret" />);
    expect(urgent).toContain('class="alert alert-info"');
    expect(urgent).toContain('role="alert"');
  });

  test('StepStatus shows a check, the index or an x, with a screen reader label', async () => {
    const done = await render(<StepStatus state="done" index={1} label="Done" />);
    expect(done).toContain('class="step step-done"');
    expect(done).toContain('icon-check');
    expect(done).toContain('aria-hidden="true"');
    expect(done).toContain('<span class="sr-only">Done</span>');
    const todo = await render(<StepStatus state="todo" index={2} label="To do" />);
    expect(todo).toBe('<span class="step step-todo">2<span class="sr-only">To do</span></span>');
    const error = await render(<StepStatus state="error" index={3} label="Error" />);
    expect(error).toContain('class="step step-error"');
    expect(error).toContain('icon-x');
    expect(error).toContain('<span class="sr-only">Error</span>');
  });

  test('Icon is a hidden inline svg drawn with currentColor', async () => {
    for (const name of ['check', 'x', 'alert', 'external'] as const) {
      const html = await render(<Icon name={name} />);
      expect(html).toStartWith('<svg');
      expect(html).toContain(`class="icon icon-${name}"`);
      expect(html).toContain('aria-hidden="true"');
      expect(html).toContain('stroke="currentColor"');
      expect(html).not.toContain('style=');
    }
  });

  test('ScrollTable wraps its table and Code renders code', async () => {
    expect(
      await render(
        <ScrollTable>
          <table />
        </ScrollTable>,
      ),
    ).toBe('<div class="table-scroll"><table></table></div>');
    expect(await render(<Code>a.b</Code>)).toBe('<code class="code">a.b</code>');
  });

  test('a ButtonLink inside an Alert action keeps the button colors', async () => {
    const html = await render(
      <Alert tone="warning" title="Reconnect" action={<ButtonLink href="/go">Go</ButtonLink>} />,
    );
    expect(html).toContain('<div class="alert-action"><a class="btn btn-primary" href="/go">');
    expect(PAGE_CSS).toContain(
      '.btn-primary { background: var(--primary); border-color: var(--primary); color: var(--primary-foreground); }',
    );
    const inheriting = [...PAGE_CSS.matchAll(/([^{}]+)\{[^}]*color: inherit/g)].map((m) =>
      (m[1] as string).trim(),
    );
    for (const selector of inheriting.flatMap((s) => s.split(',').map((x) => x.trim()))) {
      if (/\ba\b/.test(selector)) expect(selector).toContain(':not(.btn)');
    }
    for (const scope of ['.alert', '.card-warning']) {
      expect(inheriting.join(',')).toContain(`${scope} a:not(.btn)`);
    }
  });

  test('sr-only hides text visually and badges wrap on a phone', () => {
    expect(PAGE_CSS).toMatch(
      /\.sr-only \{[^}]*position: absolute;[^}]*width: 1px;[^}]*height: 1px;[^}]*overflow: hidden;[^}]*clip: rect\(0, 0, 0, 0\);[^}]*white-space: nowrap;/,
    );
    const phone = PAGE_CSS.slice(PAGE_CSS.indexOf('@media (max-width: 639px)'));
    expect(phone).toMatch(/\.badge \{[^}]*white-space: normal;/);
  });

  test('every component class has a rule in the css', () => {
    for (const selector of [
      '.card',
      '.card-warning',
      '.badge',
      '.badge-neutral',
      '.badge-success',
      '.badge-danger',
      '.btn',
      '.btn-primary',
      '.btn-secondary',
      '.btn-danger',
      '.alert',
      '.alert-warning',
      '.alert-danger',
      '.alert-info',
      '.alert-title',
      '.step',
      '.step-done',
      '.step-todo',
      '.step-error',
      '.icon',
      '.table-scroll',
      '.code',
      '.sr-only',
    ]) {
      expect(PAGE_CSS).toMatch(new RegExp(`${selector.replace('.', '\\.')}[ ,:{>]`));
    }
  });

  test('unused tone variants and element rules are gone', () => {
    for (const selector of [
      '.card-success',
      '.card-danger',
      '.card-info',
      '.card-neutral',
      '.badge-warning',
      '.badge-info',
      '.table-log',
      '.cell-wrap',
      '.cell-nowrap',
      '.table-fit',
    ]) {
      expect(PAGE_CSS).not.toContain(selector);
    }
    expect(PAGE_CSS).not.toMatch(/\b(kbd|textarea|dd|dt|summary)\b/);
    expect(PAGE_CSS).not.toContain('type=radio');
    expect(PAGE_CSS).not.toContain('min-width: 560px');
  });

  test('a short url keeps its line in an item head and the badge wraps first', () => {
    expect(PAGE_CSS).toContain('.item-head > code { flex: 1 1 12rem; }');
  });
});

const ERROR_CODES = [
  'unauthorized',
  'forbidden',
  'invalid_state',
  'access_denied',
  'installation_pending',
  'slack_oauth_failed',
  'linear_oauth_failed',
  'not_found',
  'rate_limited',
  'invalid_code',
  'space_already_linked',
  'too_many_spaces',
  'generic',
];

describe('no inline styles or scripts', () => {
  for (const lang of ['en', 'pt-BR'] as Language[]) {
    for (const code of ERROR_CODES) {
      test(`error page ${code}, ${lang}`, async () => {
        for (const action of [undefined, { kind: 'signIn' as const, href: '/auth/github' }]) {
          const html = await render(
            <ErrorPage lang={lang} code={code} action={action} supportEmail="help@example.com" />,
          );
          expect(html).not.toContain('style="');
          expect(html).not.toContain('<script');
        }
      });
    }
  }
});

const ERROR_TONES: Record<string, 'danger' | 'warning' | 'neutral'> = {
  unauthorized: 'neutral',
  forbidden: 'danger',
  invalid_state: 'danger',
  access_denied: 'danger',
  installation_pending: 'warning',
  slack_oauth_failed: 'danger',
  linear_oauth_failed: 'danger',
  not_found: 'neutral',
  rate_limited: 'warning',
  invalid_code: 'warning',
  space_already_linked: 'danger',
  too_many_spaces: 'warning',
  generic: 'neutral',
  something_else: 'neutral',
};

describe('error page', () => {
  for (const [code, tone] of Object.entries(ERROR_TONES)) {
    test(`${code} renders the ${tone} icon, its title and the support line`, async () => {
      const html = await render(
        <ErrorPage lang="en" code={code} supportEmail="help@example.com" />,
      );
      const prefix = code === 'something_else' ? 'generic' : code;
      expect(html).toContain('class="card error-card"');
      expect(html).toContain(`class="status-icon status-icon-${tone}"`);
      expect(html).toContain(`<h1>${t('en', `web.error.${prefix}.title` as MessageKey)}</h1>`);
      expect(html).toContain(t('en', `web.error.${prefix}.body` as MessageKey));
      expect(html).toContain('Questions?');
      expect(html).toContain('<a href="mailto:help@example.com">help@example.com</a>');
      expect(html).not.toContain('class="button"');
    });
  }

  test('the sign in and refresh actions render as primary buttons', async () => {
    const signIn = await render(
      <ErrorPage
        lang="en"
        code="unauthorized"
        supportEmail="help@example.com"
        action={{ kind: 'signIn', href: '/auth/github/login' }}
      />,
    );
    expect(signIn).toContain(
      '<a class="btn btn-primary" href="/auth/github/login">Sign in with GitHub</a>',
    );
    const refresh = await render(
      <ErrorPage
        lang="pt-BR"
        code="installation_pending"
        supportEmail="help@example.com"
        action={{ kind: 'refresh', href: '/setup?installation_id=1' }}
      />,
    );
    expect(refresh).toContain(
      '<a class="btn btn-primary" href="/setup?installation_id=1">Atualizar a página</a>',
    );
    expect(refresh).toContain('Dúvidas?');
  });

  test('the error page keeps the simple header without docs or sign out', async () => {
    const html = await render(
      <ErrorPage lang="en" code="forbidden" supportEmail="help@example.com" />,
    );
    expect(html).toContain('<header class="topbar">');
    expect(html.indexOf('<header')).toBeLessThan(html.indexOf('<main>'));
    expect(html).not.toContain('action="/logout"');
    expect(html).not.toContain('/docs/');
    expect(html).not.toContain('docs.standcast.app');
  });

  test('the legacy page and button rules are gone', () => {
    expect(PAGE_CSS).not.toContain('section:not([class])');
    expect(PAGE_CSS).not.toMatch(/\.button\b/);
    expect(PAGE_CSS).toMatch(/\.status-icon \{/);
    expect(PAGE_CSS).toMatch(/\.error-card \{/);
  });
});
