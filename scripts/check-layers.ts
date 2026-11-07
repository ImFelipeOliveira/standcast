import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { packageNameOf } from './check-deps';

const WORKSPACE_GLOBS = ['apps', 'packages', 'packages/adapters'];

const ALLOWED: Record<string, readonly string[]> = {
  '@standcast/core': [],
  '@standcast/db': ['@standcast/core'],
  '@standcast/queue': ['@standcast/core'],
  '@standcast/github': ['@standcast/core'],
  '@standcast/google-chat': ['@standcast/core'],
  '@standcast/linear': ['@standcast/core'],
  '@standcast/resend': ['@standcast/core'],
  '@standcast/slack': ['@standcast/core'],
  '@standcast/orchestrator': [
    '@standcast/core',
    '@standcast/db',
    '@standcast/github',
    '@standcast/linear',
    '@standcast/queue',
    '@standcast/resend',
    '@standcast/slack',
  ],
  '@standcast/api': [
    '@standcast/core',
    '@standcast/db',
    '@standcast/github',
    '@standcast/google-chat',
    '@standcast/linear',
    '@standcast/orchestrator',
    '@standcast/queue',
    '@standcast/slack',
  ],
  '@standcast/worker': [
    '@standcast/db',
    '@standcast/github',
    '@standcast/google-chat',
    '@standcast/linear',
    '@standcast/orchestrator',
    '@standcast/queue',
    '@standcast/resend',
    '@standcast/slack',
  ],
  '@standcast/cli': ['@standcast/core'],
  '@standcast/web': ['@standcast/orchestrator'],
  '@standcast/landing': [],
};

const SPECIFIER =
  /(?:^|[\s;])(?:import|export)\b[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|(?:^|[\s;])import\s+['"]([^'"]+)['"]/gm;

export function specifiers(source: string): string[] {
  const found = new Set<string>();
  for (const match of source.matchAll(SPECIFIER)) {
    const specifier = match[1] ?? match[2] ?? match[3];
    if (specifier) found.add(specifier);
  }
  return [...found];
}

export function layerViolation(importer: string, imported: string): string | null {
  if (!imported.startsWith('@standcast/')) return null;
  const allowed = ALLOWED[importer];
  if (!allowed) {
    return `${importer} has no layer rule and imports ${imported}`;
  }
  if (imported !== importer && !allowed.includes(imported)) {
    return `${importer} imports ${imported}, which its layer must not see`;
  }
  return null;
}

export function driverViolation(importer: string, imported: string): string | null {
  if ((imported === 'drizzle-orm' || imported === 'postgres') && importer !== '@standcast/db') {
    return `${importer} imports ${imported}; only @standcast/db may`;
  }
  if (imported === 'pg-boss' && importer !== '@standcast/queue') {
    return `${importer} imports ${imported}; only @standcast/queue may`;
  }
  return null;
}

export function entersAnotherPackage(
  fromFile: string,
  specifier: string,
  packageRoot: string,
  repoRoot: string,
): boolean {
  if (!specifier.startsWith('.') && !specifier.startsWith('/')) return false;
  const target = specifier.startsWith('/') ? specifier : resolve(dirname(fromFile), specifier);
  const home = relative(repoRoot, packageRoot);
  const dest = relative(repoRoot, target);
  if (dest === home || dest.startsWith(`${home}${sep}`)) return false;
  return dest.startsWith(`apps${sep}`) || dest.startsWith(`packages${sep}`);
}

function isEnoent(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

async function readDirOrEmpty(dir: string) {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (isEnoent(error)) return [];
    throw error;
  }
}

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readDirOrEmpty(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(path)));
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) files.push(path);
  }
  return files;
}

async function workspaceDirs(root: string): Promise<string[]> {
  const dirs: string[] = [];
  for (const glob of WORKSPACE_GLOBS) {
    const entries = await readDirOrEmpty(join(root, glob));
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dir = join(root, glob, entry.name);
      const hasManifest = await readFile(join(dir, 'package.json'), 'utf8').then(
        () => true,
        () => false,
      );
      if (hasManifest) dirs.push(dir);
    }
  }
  return dirs;
}

export async function checkLayers(root: string): Promise<string[]> {
  const errors: string[] = [];
  for (const dir of await workspaceDirs(root)) {
    const manifest: { name?: string } = JSON.parse(
      await readFile(join(dir, 'package.json'), 'utf8'),
    );
    const importer = manifest.name;
    if (!importer) continue;
    for (const file of await sourceFiles(join(dir, 'src'))) {
      const source = await readFile(file, 'utf8');
      for (const specifier of specifiers(source)) {
        const imported = packageNameOf(specifier);
        const violation = imported
          ? (layerViolation(importer, imported) ?? driverViolation(importer, imported))
          : null;
        if (violation) errors.push(`${file}: ${violation}`);
        if (entersAnotherPackage(file, specifier, dir, root)) {
          errors.push(`${file}: import ${specifier} enters another package`);
        }
      }
    }
  }
  return errors.sort();
}

if (import.meta.main) {
  const errors = await checkLayers(process.cwd());
  if (errors.length > 0) {
    for (const error of errors) console.error(error);
    process.exit(1);
  }
  console.log('layers: all checks passed');
}
