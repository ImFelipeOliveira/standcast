import { afterEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { chmod, cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildNpmPackages, NPM_PLATFORMS } from './npm-packages';

const dirs: string[] = [];

const EXPECTED = [
  {
    name: '@standcast/cli-darwin-arm64',
    dir: 'cli-darwin-arm64',
    os: 'darwin',
    cpu: 'arm64',
    asset: 'standcast-bun-darwin-arm64',
  },
  {
    name: '@standcast/cli-darwin-x64',
    dir: 'cli-darwin-x64',
    os: 'darwin',
    cpu: 'x64',
    asset: 'standcast-bun-darwin-x64',
  },
  {
    name: '@standcast/cli-linux-arm64',
    dir: 'cli-linux-arm64',
    os: 'linux',
    cpu: 'arm64',
    asset: 'standcast-bun-linux-arm64',
  },
  {
    name: '@standcast/cli-linux-x64',
    dir: 'cli-linux-x64',
    os: 'linux',
    cpu: 'x64',
    asset: 'standcast-bun-linux-x64',
  },
  {
    name: '@standcast/cli-win32-x64',
    dir: 'cli-win32-x64',
    os: 'win32',
    cpu: 'x64',
    asset: 'standcast-bun-windows-x64.exe',
  },
];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'standcast-npm-'));
  dirs.push(dir);
  return dir;
}

async function fakeBinaries(): Promise<string> {
  const dir = await tempDir();
  for (const platform of EXPECTED) {
    await writeFile(join(dir, platform.asset), `binary ${platform.asset}`);
  }
  return dir;
}

async function readJson(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, 'utf8'));
}

describe('buildNpmPackages', () => {
  test('supports exactly the platforms the release builds', () => {
    expect(NPM_PLATFORMS).toEqual(EXPECTED);
  });

  test('builds one package per platform with its binary', async () => {
    const out = await tempDir();
    await buildNpmPackages({ version: '1.2.3', binDir: await fakeBinaries(), outDir: out });
    for (const platform of EXPECTED) {
      const dir = join(out, platform.dir);
      const pkg = await readJson(join(dir, 'package.json'));
      expect(pkg).toMatchObject({
        name: platform.name,
        version: '1.2.3',
        license: 'MIT',
        os: [platform.os],
        cpu: [platform.cpu],
        files: ['bin'],
      });
      const binary = join(dir, 'bin', platform.os === 'win32' ? 'standcast.exe' : 'standcast');
      expect(await readFile(binary, 'utf8')).toBe(`binary ${platform.asset}`);
      expect((await stat(binary)).mode & 0o777).toBe(0o755);
    }
  });

  test('builds the main package with the launcher and every platform as optional', async () => {
    const out = await tempDir();
    await buildNpmPackages({ version: '1.2.3', binDir: await fakeBinaries(), outDir: out });
    const pkg = await readJson(join(out, 'standcast', 'package.json'));
    const server = await readJson('server.json');
    expect(pkg).toMatchObject({
      name: 'standcast',
      version: '1.2.3',
      license: 'MIT',
      mcpName: server.name,
      bin: { standcast: 'bin/standcast.js' },
      files: ['bin', 'README.md'],
    });
    expect(pkg.dependencies).toBeUndefined();
    expect(pkg.optionalDependencies).toEqual(
      Object.fromEntries(EXPECTED.map((platform) => [platform.name, '1.2.3'])),
    );
    expect(await readFile(join(out, 'standcast', 'bin', 'standcast.js'), 'utf8')).toBe(
      await readFile('npm/standcast/bin/standcast.js', 'utf8'),
    );
    expect(await readFile(join(out, 'standcast', 'README.md'), 'utf8')).toContain(
      'npx -y standcast',
    );
  });

  test('returns the platforms first and the main package last, in publish order', async () => {
    const out = await tempDir();
    const order = await buildNpmPackages({
      version: '1.2.3',
      binDir: await fakeBinaries(),
      outDir: out,
    });
    expect(order).toEqual([
      ...EXPECTED.map((platform) => join(out, platform.dir)),
      join(out, 'standcast'),
    ]);
  });

  test('refuses a missing binary or a version that is not semver', async () => {
    const bins = await fakeBinaries();
    await rm(join(bins, 'standcast-bun-linux-arm64'));
    expect(
      buildNpmPackages({ version: '1.2.3', binDir: bins, outDir: await tempDir() }),
    ).rejects.toThrow('standcast-bun-linux-arm64');
    expect(
      buildNpmPackages({ version: 'v1.2', binDir: await fakeBinaries(), outDir: await tempDir() }),
    ).rejects.toThrow('version');
  });
});

describe('server.json', () => {
  test('describes the npm package at the released version', async () => {
    const server = await readJson('server.json');
    const manifest = await readJson('.release-please-manifest.json');
    expect(server.name).toBe('io.github.ImFelipeOliveira/standcast');
    expect((server.description as string).length).toBeLessThanOrEqual(100);
    expect(server.version).toBe(manifest['.']);
    expect(server.packages).toEqual([
      expect.objectContaining({
        registryType: 'npm',
        identifier: 'standcast',
        version: manifest['.'],
        transport: { type: 'stdio' },
        packageArguments: [{ type: 'positional', value: 'mcp' }],
      }),
    ]);
  });

  test('release-please bumps both of its versions', async () => {
    const config = await readJson('release-please-config.json');
    const extra = (config.packages as Record<string, { 'extra-files': unknown[] }>)['.'][
      'extra-files'
    ];
    expect(extra).toEqual(
      expect.arrayContaining([
        { type: 'json', path: 'server.json', jsonpath: '$.version' },
        { type: 'json', path: 'server.json', jsonpath: '$.packages[0].version' },
      ]),
    );
  });
});

describe.skipIf(process.platform === 'win32')('the launcher', () => {
  const platform = EXPECTED.find(
    (entry) => entry.os === process.platform && entry.cpu === process.arch,
  );

  async function install(withBinary: boolean): Promise<string> {
    const root = await tempDir();
    const modules = join(root, 'node_modules');
    await mkdir(join(modules, 'standcast', 'bin'), { recursive: true });
    await cp('npm/standcast/bin/standcast.js', join(modules, 'standcast', 'bin', 'standcast.js'));
    if (withBinary && platform) {
      const bin = join(modules, platform.name, 'bin');
      await mkdir(bin, { recursive: true });
      await writeFile(join(modules, platform.name, 'package.json'), '{"name":"x"}');
      await writeFile(join(bin, 'standcast'), '#!/bin/sh\necho "args: $*"\nexit 3\n');
      await chmod(join(bin, 'standcast'), 0o755);
    }
    return join(modules, 'standcast', 'bin', 'standcast.js');
  }

  test.skipIf(!platform)(
    'runs the platform binary with the same arguments and exit code',
    async () => {
      const launcher = await install(true);
      const run = spawnSync('node', [launcher, 'mcp', '--flag'], { encoding: 'utf8' });
      expect(run.stdout).toBe('args: mcp --flag\n');
      expect(run.status).toBe(3);
    },
  );

  test.skipIf(!platform)(
    'says how to fix a missing platform package, in English by default',
    async () => {
      const launcher = await install(false);
      const env = { PATH: process.env.PATH, LANG: 'C' };
      const run = spawnSync('node', [launcher, 'mcp'], { encoding: 'utf8', env });
      expect(run.status).toBe(1);
      expect(run.stderr).toContain('is not installed. Reinstall without --omit=optional');
    },
  );

  test.skipIf(!platform)(
    'answers in Portuguese with the same language rule as the CLI',
    async () => {
      const launcher = await install(false);
      for (const env of [
        { LANG: 'pt_BR.UTF-8' },
        { LANG: 'en_US.UTF-8', STANDCAST_LANG: 'pt-BR' },
      ]) {
        const run = spawnSync('node', [launcher, 'mcp'], {
          encoding: 'utf8',
          env: { PATH: process.env.PATH, ...env },
        });
        expect(run.status).toBe(1);
        expect(run.stderr).toContain('não está instalado. Instale de novo sem --omit=optional');
      }
    },
  );
});
