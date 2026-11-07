import { describe, expect, test } from 'bun:test';
import { Validator } from '@seriousme/openapi-schema-validator';
import rootPackage from '../../../package.json' with { type: 'json' };
import { useCleanDb } from '../../../packages/db/test/setup';
import { createTestApp } from './support';

useCleanDb();

describe('removed setup forms', () => {
  test('the webhook form routes are gone', async () => {
    const { app } = createTestApp();
    const created = await app.request('/setup/webhooks', { method: 'POST' });
    expect(created.status).toBe(404);
    const disabled = await app.request('/setup/webhooks/endpoint/disable', { method: 'POST' });
    expect(disabled.status).toBe(404);
    const tested = await app.request('/setup/webhooks/endpoint/test', { method: 'POST' });
    expect(tested.status).toBe(404);
  });
});

describe('openapi webhooks', () => {
  test('the public document has the webhooks section with the 3 events', async () => {
    const { app } = createTestApp();
    const res = await app.request('/openapi.json');
    const doc = (await res.json()) as {
      info: { version: string; description: string };
      webhooks: Record<
        string,
        {
          post: {
            tags: string[];
            summary: string;
            requestBody: { content: { 'application/json': { schema: unknown; example: unknown } } };
          };
        }
      >;
    };
    expect(doc.info.version).toBe(rootPackage.version);
    for (const event of ['daily.submitted', 'blocker.opened', 'digest.sent']) {
      const op = doc.webhooks[event]?.post;
      expect(op?.tags).toEqual(['Webhooks']);
      expect(op?.summary).toBeTruthy();
      const json = op?.requestBody.content['application/json'];
      expect(json?.schema).toBeDefined();
      expect((json?.example as { type: string } | undefined)?.type).toBe(event);
    }
    expect(doc.info.description).toContain('Standcast-Signature');
    const result = await new Validator().validate(doc);
    expect(result.errors).toBeUndefined();
  });
});
