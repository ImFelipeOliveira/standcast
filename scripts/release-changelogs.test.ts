import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { changelogVersionProblems } from './check-docs';
import { CHANGELOGS, releaseChangelog, releaseChangelogs } from './release-changelogs';

const SOURCES: Record<string, string> = {
  'docs/site/changelog.md':
    '# Changelog\n\n## Product\n\n### Unreleased\n\n- New thing.\n\n### 0.4.1 — 2026-11-02\n\n- Old.\n',
  'docs/site/pt-BR/changelog.md':
    '# Changelog\n\n## Produto\n\n### Não lançado\n\n- Novidade.\n\n### 0.4.1 — 02/11/2026\n\n- Antigo.\n',
  'docs/api/CHANGELOG.md':
    '# API changelog\n\n## Unreleased\n\n- No API changes.\n\n## 0.4.1 — 2026-11-02\n',
};

async function repo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'standcast-release-'));
  for (const [file, text] of Object.entries(SOURCES)) {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await writeFile(join(root, file), text);
  }
  return root;
}

describe('release changelogs', () => {
  test('moves unreleased entries under the new version and passes the version check', async () => {
    const root = await repo();
    const changed = await releaseChangelogs(root, '0.5.0', '2026-11-06');
    expect(changed).toEqual(CHANGELOGS.map((c) => c.file));
    for (const { file } of CHANGELOGS) {
      const text = await readFile(join(root, file), 'utf8');
      expect(changelogVersionProblems(file, text, '0.5.0')).toEqual([]);
    }
    const en = await readFile(join(root, 'docs/site/changelog.md'), 'utf8');
    expect(en).toContain('### Unreleased\n\n### 0.5.0 — 2026-11-06\n\n- New thing.');
    const pt = await readFile(join(root, 'docs/site/pt-BR/changelog.md'), 'utf8');
    expect(pt).toContain('### Não lançado\n\n### 0.5.0 — 06/11/2026\n\n- Novidade.');
  });

  test('an empty product changelog fails and an empty API changelog says so', () => {
    const product =
      '# Changelog\n\n## Product\n\n### Unreleased\n\n### 0.4.1 — 2026-11-02\n\n- Old.\n';
    expect(() => releaseChangelog(CHANGELOGS[0], product, '0.5.0', '2026-11-06')).toThrow(
      'has no notes under ### Unreleased',
    );
    const api = CHANGELOGS[2];
    const text = releaseChangelog(
      api,
      '# API changelog\n\n## Unreleased\n\n## 0.4.1 — 2026-11-02\n',
      '0.5.0',
      '2026-11-06',
    );
    expect(text).toContain('## 0.5.0 — 2026-11-06\n\n- No public API changes.\n');
  });

  test('running twice changes nothing', async () => {
    const root = await repo();
    await releaseChangelogs(root, '0.5.0', '2026-11-06');
    const before = await readFile(join(root, 'docs/api/CHANGELOG.md'), 'utf8');
    expect(await releaseChangelogs(root, '0.5.0', '2026-11-07')).toEqual([]);
    expect(await readFile(join(root, 'docs/api/CHANGELOG.md'), 'utf8')).toBe(before);
  });

  test('a retry after a partial run releases only what is left', async () => {
    const root = await repo();
    const api = 'docs/api/CHANGELOG.md';
    await writeFile(
      join(root, api),
      '# API changelog\n\n## Unreleased\n\n## 0.5.0 — 2026-11-06\n\n- No API changes.\n',
    );
    const before = await readFile(join(root, api), 'utf8');
    expect(await releaseChangelogs(root, '0.5.0', '2026-11-07')).toEqual([
      'docs/site/changelog.md',
      'docs/site/pt-BR/changelog.md',
    ]);
    expect(await readFile(join(root, api), 'utf8')).toBe(before);
  });

  test('a changelog without the unreleased heading fails loudly', async () => {
    const root = await repo();
    await writeFile(join(root, 'docs/api/CHANGELOG.md'), '# API changelog\n');
    await expect(releaseChangelogs(root, '0.5.0', '2026-11-06')).rejects.toThrow('not found');
  });
});
