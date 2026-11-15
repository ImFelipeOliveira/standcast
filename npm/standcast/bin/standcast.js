#!/usr/bin/env node
const { spawnSync } = require('node:child_process');

const platforms = {
  'darwin arm64': '@standcast/cli-darwin-arm64',
  'darwin x64': '@standcast/cli-darwin-x64',
  'linux arm64': '@standcast/cli-linux-arm64',
  'linux x64': '@standcast/cli-linux-x64',
  'win32 x64': '@standcast/cli-win32-x64',
};

const messages = {
  en: {
    unsupported: (value) => `no binary for ${value}. See https://docs.standcast.app/members/cli`,
    missing: (value) =>
      `${value} is not installed. Reinstall without --omit=optional or --no-optional.`,
  },
  'pt-BR': {
    unsupported: (value) =>
      `não há binário para ${value}. Veja https://docs.standcast.app/pt-BR/members/cli`,
    missing: (value) =>
      `o ${value} não está instalado. Instale de novo sem --omit=optional nem --no-optional.`,
  },
};

function language(env) {
  const raw = env.STANDCAST_LANG || env.LC_ALL || env.LANG || '';
  const tag = raw.split('.')[0].split('@')[0].replace(/_/g, '-').toLowerCase();
  return tag === 'pt' || tag.startsWith('pt-') ? 'pt-BR' : 'en';
}

function t(lang, key, value) {
  return messages[lang][key](value);
}

function fail(message) {
  process.stderr.write(`standcast: ${message}\n`);
  process.exit(1);
}

const lang = language(process.env);
const pkg = platforms[`${process.platform} ${process.arch}`];
if (!pkg) fail(t(lang, 'unsupported', `${process.platform} ${process.arch}`));

const file = process.platform === 'win32' ? 'standcast.exe' : 'standcast';
let binary;
try {
  binary = require.resolve(`${pkg}/bin/${file}`);
} catch {
  fail(t(lang, 'missing', pkg));
}

const result = spawnSync(binary, process.argv.slice(2), { stdio: 'inherit' });
if (result.error) fail(result.error.message);
if (result.signal) process.kill(process.pid, result.signal);
process.exit(result.status ?? 1);
