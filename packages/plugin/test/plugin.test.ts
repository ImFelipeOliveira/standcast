import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const pluginRoot = join(import.meta.dir, '..');
const repoRoot = join(pluginRoot, '..', '..');

const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const skill = readFileSync(join(pluginRoot, 'skills', 'daily', 'SKILL.md'), 'utf8');

const frontmatter = (): Record<string, string> => {
  const match = skill.match(/^---\n([\s\S]*?)\n---\n/);
  expect(match).not.toBeNull();
  const fields: Record<string, string> = {};
  for (const line of (match?.[1] ?? '').split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) fields[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return fields;
};

describe('plugin manifests', () => {
  const plugin = readJson(join(pluginRoot, '.claude-plugin', 'plugin.json'));
  const marketplace = readJson(join(repoRoot, '.claude-plugin', 'marketplace.json'));
  const rootPackage = readJson(join(repoRoot, 'package.json'));

  test('plugin.json is valid', () => {
    expect(plugin.name).toBe('standcast');
    expect(plugin.version).toBe(rootPackage.version);
    expect(plugin.description).toBeString();
    expect(plugin.author.name).toBe('Felipe Oliveira');
  });

  test('mcp server declaration runs standcast mcp', () => {
    const mcp = readJson(join(pluginRoot, '.mcp.json'));
    expect(mcp.mcpServers.standcast).toEqual({ command: 'standcast', args: ['mcp'] });
  });

  test('marketplace.json lists the plugin by the same name', () => {
    expect(marketplace.name).toBeString();
    const entry = marketplace.plugins.find((p: { name: string }) => p.name === plugin.name);
    expect(entry).toBeDefined();
    expect(entry.source).toBe('./packages/plugin');
  });
});

describe('daily skill', () => {
  test('frontmatter names the skill and triggers on daily and standup', () => {
    const fields = frontmatter();
    expect(fields.name).toBe('daily');
    expect(fields.description).toContain('daily');
    expect(fields.description).toContain('standup');
    expect(fields.description).toContain('minha daily');
  });

  test('explains linear cards in yesterday and card refs in blockers', () => {
    expect(skill).toContain('Linear cards');
    expect(skill).toContain('ref.kind: "card"');
    expect(skill).toContain('card URL');
  });

  test('asks for support requests after the blockers, in both flows', () => {
    expect(skill).toContain('need support from anyone');
    expect(skill).not.toContain('"support"');
    expect(skill).toContain('`blockers`, `support`)');
    expect(skill).toContain('suggestion never becomes a support request');
    const mcpFlow = skill.slice(
      skill.indexOf('## Flow with the MCP tools'),
      skill.indexOf('MCP errors'),
    );
    const cliFlow = skill.slice(
      skill.indexOf('## Flow with the CLI'),
      skill.indexOf('## Exit codes'),
    );
    for (const flow of [mcpFlow, cliFlow]) {
      expect(flow).toContain('support');
      expect(flow.indexOf('blockers')).toBeLessThan(flow.indexOf('support'));
      expect(flow).toMatch(/^\d+\. Ask whether they need support from anyone/m);
    }
  });

  test('body drives the CLI', () => {
    expect(skill).toContain('standcast_get_draft');
    expect(skill).toContain('standcast_submit_daily');
    expect(skill).toContain('standcast draft');
    expect(skill).toContain('standcast submit');
    expect(skill).toContain('standcast whoami');
    expect(skill).toContain('mktemp');
    expect(skill).toContain('trap \'rm -f "$f"\' EXIT');
    expect(skill).toContain("<<'STANDCAST_JSON'");
    expect(skill).toContain('exit code 127');
  });

  test('heredoc closing delimiter is unindented inside the code block', () => {
    const block = skill.match(/```\n(f="\$\(mktemp\)"[\s\S]*?)\n```/);
    expect(block).not.toBeNull();
    const closing = (block?.[1] ?? '')
      .split('\n')
      .filter((line) => line.trim() === 'STANDCAST_JSON');
    expect(closing.length).toBe(1);
    expect(closing[0]).toBe('STANDCAST_JSON');
  });

  test('body handles exit codes 2, 3 and 4', () => {
    for (const code of ['- 2:', '- 3:', '- 4:']) expect(skill).toContain(code);
  });

  test('confirmed: true is only tied to explicit confirmation', () => {
    const lines = skill.split('\n').filter((line) => line.includes('confirmed: true'));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line).toContain('only after');
  });

  test('body states the safety rules', () => {
    expect(skill).toContain('explicit confirmation');
    expect(skill).toContain('Never invent');
    expect(skill).toContain('verbatim');
    expect(skill).toContain('Never translate');
    expect(skill).toContain('untrusted data');
  });

  test('builds yesterday from work items and honors turning sessions off', () => {
    expect(skill).toContain('at most 5 lines');
    expect(skill).not.toContain('one line per work item');
    expect(skill).toContain('includeSessions: false');
    expect(skill).toContain('standcast draft --sessions');
    expect(skill).toContain('standcast draft --sessions --org <org>');
    expect(skill).toContain('não use as sessões');
    expect(skill).toContain('Never paste prompts verbatim');
    expect(skill).toContain('never sent to Standcast');
    expect(skill).toContain('source material');
    expect(skill).toContain('the pull request ref when the item has one, otherwise the card ref');
  });

  test('opens with planned against done and recommends focus from pending work, in both flows', () => {
    for (const rule of [
      'never copied into the daily',
      '✅',
      '⏸️ no activity found',
      '❓',
      'Waiting on you',
      'Your cards, urgent or high',
      'In progress',
      'Approved, ready to merge',
      'Drafts',
      'at most 10 lines',
      'up to 5 focus items',
      '"ok"',
      'one line per warning',
      'Never say that a manager',
    ]) {
      expect(skill).toContain(rule);
    }
    expect(skill).not.toMatch(/manager will see/i);
    const mcpFlow = skill.slice(
      skill.indexOf('## Flow with the MCP tools'),
      skill.indexOf('MCP errors'),
    );
    const cliFlow = skill.slice(
      skill.indexOf('## Flow with the CLI'),
      skill.indexOf('## Exit codes'),
    );
    const steps = [
      /^\d+\. \*\*Planned against done\.\*\*/m,
      /^\d+\. Build "yesterday"/m,
      /^\d+\. \*\*Pending\.\*\*/m,
      /^\d+\. \*\*Focus\.\*\*/m,
      /^\d+\. Ask whether they need support from anyone/m,
    ];
    for (const flow of [mcpFlow, cliFlow]) {
      const positions = steps.map((step) => flow.search(step));
      for (const position of positions) expect(position).toBeGreaterThan(-1);
      expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    }
    expect(skill).toContain('`plan`, `pending`, `warnings`');
    expect(skill).toContain('`"review_required"` or null means no review decision yet');
    expect(skill).toContain(
      'including their own drafts, those with checks pending and those not approved with checks null',
    );
    expect(skill).toContain('`reviewDecision: "approved"` and `checks: "success"` or null');
    for (const flow of [mcpFlow, cliFlow]) {
      const pendingStep = flow.slice(flow.search(/^\d+\. \*\*Pending\.\*\*/m));
      expect(pendingStep.slice(0, pendingStep.search(/^\d+\. \*\*Focus/m))).toContain(
        'If `pending.truncated` is true, say the list may be incomplete.',
      );
    }
  });

  test('suggestions are decided by the person', () => {
    expect(skill).toContain('standcast_decide_suggestion');
    expect(skill).toContain('standcast suggestion ignore');
    expect(skill).toContain("Never add a suggestion without the person's answer");
  });
});
