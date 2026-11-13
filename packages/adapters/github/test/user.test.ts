import { describe, expect, test } from 'bun:test';
import { getUserProfile } from '../src/user';
import { fakeFetch, fixture } from './helpers';

const routes = {
  'GET /user': { body: fixture('user.json') },
  'GET /user/emails': { body: fixture('user-emails.json') },
  'GET /user/installations': { body: fixture('user-installations.json') },
};

describe('getUserProfile', () => {
  test('getUserProfile picks primary verified email', async () => {
    const { fetch, calls } = fakeFetch(routes);
    const profile = await getUserProfile('ghu_token', { fetch });
    expect(profile).toEqual({
      githubUserId: 42,
      login: 'alice',
      email: 'alice@acme.com',
      verifiedEmails: ['old@x.com', 'alice@acme.com'],
      installationIds: [1, 2, 3],
    });
    expect(calls.length).toBe(3);
  });

  test('filters installations to our app', async () => {
    const { fetch } = fakeFetch(routes);
    const profile = await getUserProfile('ghu_token', { fetch, appId: 100 });
    expect(profile.installationIds).toEqual([1, 3]);
  });

  test('reads every page of emails', async () => {
    const firstPage = Array.from({ length: 100 }, (_, i) => ({
      email: `alias${i}@x.com`,
      primary: false,
      verified: false,
    }));
    const secondPage = [{ email: 'work@acme.com', primary: false, verified: true }];
    const { fetch } = fakeFetch({
      ...routes,
      'GET /user/emails': (url) => ({
        body: JSON.stringify(url.searchParams.get('page') === '2' ? secondPage : firstPage),
      }),
    });
    expect((await getUserProfile('ghu_token', { fetch })).verifiedEmails).toEqual([
      'work@acme.com',
    ]);
  });

  test('verified emails are unknown when the list reaches the page cap', async () => {
    const full = Array.from({ length: 100 }, (_, i) => ({
      email: `alias${i}@x.com`,
      primary: i === 0,
      verified: true,
    }));
    const { fetch, calls } = fakeFetch({
      ...routes,
      'GET /user/emails': { body: JSON.stringify(full) },
    });
    const profile = await getUserProfile('ghu_token', { fetch });
    expect(profile.verifiedEmails).toBeNull();
    expect(profile.email).toBe('alias0@x.com');
    expect(calls.filter((call) => call.url.pathname === '/user/emails').length).toBe(10);
  });

  test('email is null when none is primary and verified', async () => {
    const { fetch } = fakeFetch({ ...routes, 'GET /user/emails': { body: '[]' } });
    const profile = await getUserProfile('ghu_token', { fetch });
    expect(profile.email).toBeNull();
    expect(profile.verifiedEmails).toEqual([]);
  });
});
