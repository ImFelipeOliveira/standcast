import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

type Changelog = {
  file: string;
  unreleased: string;
  prefix: string;
  date: (iso: string) => string;
};

const toBr = (iso: string) => iso.split('-').reverse().join('/');

export const CHANGELOGS: Changelog[] = [
  {
    file: 'docs/site/changelog.md',
    unreleased: '### Unreleased',
    prefix: '### ',
    date: (iso) => iso,
  },
  {
    file: 'docs/site/pt-BR/changelog.md',
    unreleased: '### Não lançado',
    prefix: '### ',
    date: toBr,
  },
  { file: 'docs/api/CHANGELOG.md', unreleased: '## Unreleased', prefix: '## ', date: (iso) => iso },
];

export function releaseChangelog(
  changelog: Changelog,
  text: string,
  version: string,
  isoDate: string,
): string {
  const lines = text.split('\n');
  if (lines.some((line) => line.startsWith(`${changelog.prefix}${version} — `))) return text;
  const index = lines.findIndex((line) => line.trim() === changelog.unreleased);
  if (index === -1) throw new Error(`${changelog.file}: "${changelog.unreleased}" not found`);
  const heading = `${changelog.prefix}${version} — ${changelog.date(isoDate)}`;
  return [...lines.slice(0, index + 1), '', heading, ...lines.slice(index + 1)].join('\n');
}

export async function releaseChangelogs(
  root: string,
  version: string,
  isoDate: string,
): Promise<string[]> {
  const changed: string[] = [];
  for (const changelog of CHANGELOGS) {
    const path = join(root, changelog.file);
    const text = await readFile(path, 'utf8');
    const next = releaseChangelog(changelog, text, version, isoDate);
    if (next === text) continue;
    await writeFile(path, next);
    changed.push(changelog.file);
  }
  return changed;
}

if (import.meta.main) {
  const root = join(import.meta.dir, '..');
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as { version: string };
  const isoDate = process.argv[2] ?? new Date().toISOString().slice(0, 10);
  const changed = await releaseChangelogs(root, pkg.version, isoDate);
  console.log(changed.length > 0 ? `released ${pkg.version}: ${changed.join(', ')}` : 'no change');
}
