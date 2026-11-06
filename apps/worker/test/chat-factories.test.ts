import { describe, expect, test } from 'bun:test';
import { generateKeys } from '../../../packages/adapters/google-chat/test/keys';
import { chatFactories } from '../src/chat-factories';

describe('chatFactories', () => {
  test('worker builds the google chat channel only with the env set', async () => {
    expect(chatFactories(undefined)['google-chat']).toBeNull();

    const keys = await generateKeys();
    const urls: string[] = [];
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      urls.push(url);
      if (url === 'https://oauth2.googleapis.com/token') {
        return Response.json({ access_token: 'ya29.token', expires_in: 3600 });
      }
      return Response.json({ name: 'spaces/AAA' });
    }) as typeof fetch;
    const factories = chatFactories(
      { clientEmail: 'bot@p.iam.gserviceaccount.com', privateKey: keys.pem },
      { fetch: fetchImpl },
    );
    const build = factories['google-chat'];
    if (!build) throw new Error('expected a google chat factory');
    expect(await build().checkChannel('spaces/AAA')).toBe('ok');
    expect(await build().checkChannel('spaces/AAA')).toBe('ok');
    expect(urls.filter((url) => url === 'https://oauth2.googleapis.com/token')).toHaveLength(1);
    expect(urls.filter((url) => url.endsWith('/v1/spaces/AAA'))).toHaveLength(2);
    expect(typeof factories.slack).toBe('function');
  });
});
