import { describe, expect, test } from 'bun:test';
import { createTestApp } from './support';

describe('removed setup forms', () => {
  test('the api key form routes are gone', async () => {
    const { app } = createTestApp();
    const created = await app.request('/setup/api-keys', { method: 'POST' });
    expect(created.status).toBe(404);
    const revoked = await app.request('/setup/api-keys/key/revoke', { method: 'POST' });
    expect(revoked.status).toBe(404);
  });
});
