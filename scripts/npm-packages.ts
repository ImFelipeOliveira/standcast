import { chmod, copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

type NpmPlatform = { name: string; dir: string; os: string; cpu: string; asset: string };

function platform(os: string, cpu: string, target: string): NpmPlatform {
  const name = `@standcast/cli-${os}-${cpu}`;
  const asset = `standcast-bun-${target}${os === 'win32' ? '.exe' : ''}`;
  return { name, dir: `cli-${os}-${cpu}`, os, cpu, asset };
}

export const NPM_PLATFORMS: NpmPlatform[] = [
  platform('darwin', 'arm64', 'darwin-arm64'),
  platform('darwin', 'x64', 'darwin-x64'),
  platform('linux', 'arm64', 'linux-arm64'),
  platform('linux', 'x64', 'linux-x64'),
  platform('win32', 'x64', 'windows-x64'),
];

const SEMVER = /^\d+\.\d+\.\d+$/;
const LAUNCHER_DIR = 'npm/standcast';

const common = {
  license: 'MIT',
  author: 'Felipe Oliveira',
  homepage: 'https://standcast.app',
  repository: { type: 'git', url: 'git+https://github.com/ImFelipeOliveira/standcast.git' },
  bugs: { url: 'https://github.com/ImFelipeOliveira/standcast/issues' },
};

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function buildPlatform(entry: NpmPlatform, version: string, binDir: string, outDir: string) {
  const dir = join(outDir, entry.dir);
  const binary = entry.os === 'win32' ? 'standcast.exe' : 'standcast';
  await mkdir(join(dir, 'bin'), { recursive: true });
  try {
    await copyFile(join(binDir, entry.asset), join(dir, 'bin', binary));
  } catch {
    throw new Error(`missing CLI binary ${entry.asset} in ${binDir}`);
  }
  await chmod(join(dir, 'bin', binary), 0o755);
  await writeJson(join(dir, 'package.json'), {
    name: entry.name,
    version,
    description: `The Standcast CLI binary for ${entry.os} ${entry.cpu}. Install the standcast package instead.`,
    ...common,
    os: [entry.os],
    cpu: [entry.cpu],
    files: ['bin'],
    preferUnplugged: true,
  });
  return dir;
}

async function buildMain(version: string, outDir: string): Promise<string> {
  const dir = join(outDir, 'standcast');
  const server = JSON.parse(await readFile('server.json', 'utf8')) as { name: string };
  await mkdir(join(dir, 'bin'), { recursive: true });
  await copyFile(join(LAUNCHER_DIR, 'bin', 'standcast.js'), join(dir, 'bin', 'standcast.js'));
  await chmod(join(dir, 'bin', 'standcast.js'), 0o755);
  await copyFile(join(LAUNCHER_DIR, 'README.md'), join(dir, 'README.md'));
  await writeJson(join(dir, 'package.json'), {
    name: 'standcast',
    version,
    description:
      'Write your daily standup in your AI agent, confirm it, and post one team digest to Slack or Google Chat.',
    ...common,
    keywords: ['standup', 'daily', 'mcp', 'mcp-server', 'claude-code', 'github', 'slack'],
    mcpName: server.name,
    bin: { standcast: 'bin/standcast.js' },
    files: ['bin', 'README.md'],
    engines: { node: '>=18' },
    optionalDependencies: Object.fromEntries(NPM_PLATFORMS.map((entry) => [entry.name, version])),
  });
  return dir;
}

export async function buildNpmPackages(input: {
  version: string;
  binDir: string;
  outDir: string;
}): Promise<string[]> {
  if (!SEMVER.test(input.version)) {
    throw new Error(`version must look like 1.2.3, got ${input.version}`);
  }
  await rm(input.outDir, { recursive: true, force: true });
  const platforms: string[] = [];
  for (const entry of NPM_PLATFORMS) {
    platforms.push(await buildPlatform(entry, input.version, input.binDir, input.outDir));
  }
  return [...platforms, await buildMain(input.version, input.outDir)];
}

if (import.meta.main) {
  const [version = '', binDir = 'dist', outDir = 'dist/npm'] = process.argv.slice(2);
  const order = await buildNpmPackages({ version, binDir, outDir });
  process.stdout.write(`${order.join('\n')}\n`);
}
