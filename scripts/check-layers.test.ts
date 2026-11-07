import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkLayers,
  driverViolation,
  entersAnotherPackage,
  layerViolation,
  specifiers,
} from './check-layers';

describe('check-layers', () => {
  test('reads static, type, dynamic and side-effect imports', () => {
    const source = [
      "import type { Db } from '@standcast/db';",
      "export { x } from '@standcast/core';",
      "export * from '@standcast/github';",
      "export * as slack from '@standcast/slack';",
      `import {
  a,
  b,
} from '@standcast/linear';`,
      "import db, { Db as Database } from '@standcast/queue';",
      "import { c } from '@standcast/resend'; import { d } from 'drizzle-orm';",
      "const m = await import('@standcast/queue');",
      "import 'drizzle-orm';",
      "import { a } from './a';",
    ].join('\n');
    expect(specifiers(source).sort()).toEqual([
      './a',
      '@standcast/core',
      '@standcast/db',
      '@standcast/github',
      '@standcast/linear',
      '@standcast/queue',
      '@standcast/resend',
      '@standcast/slack',
      'drizzle-orm',
    ]);
  });

  test('blocks imports that skip a layer', () => {
    expect(layerViolation('@standcast/core', '@standcast/db')).toMatch(/must not see/);
    expect(layerViolation('@standcast/github', '@standcast/slack')).toMatch(/must not see/);
    expect(layerViolation('@standcast/orchestrator', '@standcast/google-chat')).toMatch(
      /must not see/,
    );
    expect(layerViolation('@standcast/web', '@standcast/db')).toMatch(/must not see/);
    expect(layerViolation('@standcast/api', '@standcast/worker')).toMatch(/must not see/);
    expect(layerViolation('@standcast/orchestrator', '@standcast/db')).toBeNull();
    expect(layerViolation('@standcast/api', '@standcast/orchestrator')).toBeNull();
    expect(layerViolation('@standcast/core', 'zod')).toBeNull();
  });

  test('keeps database and queue drivers inside their packages', () => {
    expect(driverViolation('@standcast/api', 'drizzle-orm')).toMatch(/only @standcast\/db/);
    expect(driverViolation('@standcast/api', 'postgres')).toMatch(/only @standcast\/db/);
    expect(driverViolation('@standcast/db', 'drizzle-orm')).toBeNull();
    expect(driverViolation('@standcast/orchestrator', 'pg-boss')).toMatch(/only @standcast\/queue/);
    expect(driverViolation('@standcast/queue', 'pg-boss')).toBeNull();
  });

  test('flags a relative import that enters another package', () => {
    const repo = '/repo';
    const root = join(repo, 'packages/core');
    const file = join(root, 'src/a.ts');
    expect(entersAnotherPackage(file, '../../db/src', root, repo)).toBe(true);
    expect(entersAnotherPackage(file, './b', root, repo)).toBe(false);
    expect(entersAnotherPackage(file, '@standcast/db', root, repo)).toBe(false);
    expect(entersAnotherPackage(file, '../../../package.json', root, repo)).toBe(false);
    expect(entersAnotherPackage(file, '../../../docs/api/guide.md', root, repo)).toBe(false);
  });

  test('reports a forbidden import inside a package src tree', async () => {
    const root = await mkdtemp(join(tmpdir(), 'check-layers-'));
    const file = join(root, 'packages/core/src/bad.ts');
    await mkdir(join(root, 'packages/core/src'), { recursive: true });
    await writeFile(join(root, 'packages/core/package.json'), '{"name":"@standcast/core"}\n');
    await writeFile(file, "import { db } from '@standcast/db';\n");
    try {
      const errors = await checkLayers(root);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain(file);
      expect(errors[0]).toContain('@standcast/db');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('the repository src tree follows the layers', async () => {
    expect(await checkLayers(join(import.meta.dir, '..'))).toEqual([]);
  });
});
