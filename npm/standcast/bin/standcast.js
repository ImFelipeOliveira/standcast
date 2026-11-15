#!/usr/bin/env node
const { spawnSync } = require('node:child_process');

const platforms = {
  'darwin arm64': '@standcast/cli-darwin-arm64',
  'darwin x64': '@standcast/cli-darwin-x64',
  'linux arm64': '@standcast/cli-linux-arm64',
  'linux x64': '@standcast/cli-linux-x64',
  'win32 x64': '@standcast/cli-win32-x64',
};

function fail(message) {
  process.stderr.write(`standcast: ${message}\n`);
  process.exit(1);
}

const pkg = platforms[`${process.platform} ${process.arch}`];
if (!pkg) {
  fail(
    `no binary for ${process.platform} ${process.arch}. See https://docs.standcast.app/members/cli`,
  );
}

const file = process.platform === 'win32' ? 'standcast.exe' : 'standcast';
let binary;
try {
  binary = require.resolve(`${pkg}/bin/${file}`);
} catch {
  fail(`${pkg} is not installed. Reinstall without --omit=optional or --no-optional.`);
}

const result = spawnSync(binary, process.argv.slice(2), { stdio: 'inherit' });
if (result.error) fail(result.error.message);
if (result.signal) process.kill(process.pid, result.signal);
process.exit(result.status ?? 1);
