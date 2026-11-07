import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');

describe('production api origin', () => {
  test('the production api url is the origin allowed by connect-src', () => {
    const env = readFileSync(join(root, '.env.production'), 'utf8');
    const headers = readFileSync(join(root, 'public/_headers'), 'utf8');
    const url = /^VITE_API_URL=(\S+)/m.exec(env)?.[1];
    expect(url).toBe('https://api.standcast.app');
    expect(headers).toContain(`connect-src 'self' ${url}`);
  });
});
