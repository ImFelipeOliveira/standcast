import { describe, expect, test } from 'bun:test';
import config from '../vite.config';

describe('dev proxy', () => {
  test('the app owns /setup and only api paths are proxied', () => {
    const proxy = config.server?.proxy ?? {};
    expect(Object.keys(proxy).sort()).toEqual(['/auth', '/connect', '/oauth', '/v1']);
    expect(proxy).not.toHaveProperty('/setup');
  });
});
