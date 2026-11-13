import { describe, expect, test } from 'bun:test';
import { buildBlockerAlert } from '../src/blocker-alert';

const ref = {
  kind: 'pull_request' as const,
  url: 'https://github.com/acme/api/pull/7',
  title: 'Add cache',
};

const base = {
  team: 'Alpha',
  managers: [{ login: 'carol', chatUserId: 'UCAROL' }, { login: 'dave' }],
  author: 'Alice',
  blocker: { text: 'waiting on the staging database', ref },
  ageDays: 6,
  openedOn: '2026-10-22',
  routedTo: ['bob', 'erin'],
};

describe('buildBlockerAlert', () => {
  test('english alert names the blocker, its age, author, link and routing', () => {
    const msg = buildBlockerAlert({ lang: 'en', ...base });
    const text = msg.fallbackText;
    expect(text).toContain('Blocker open for 6 days · Alpha');
    expect(text).toContain('@UCAROL, @dave');
    expect(text).toContain('waiting on the staging database');
    expect(text).toContain(`Add cache (${ref.url})`);
    expect(text).toContain('Open since 2026-10-22, reported by @Alice.');
    expect(text).toContain('Routed to @bob, @erin.');
  });

  test('mentions every manager with a chat id and writes the others as logins', () => {
    const msg = buildBlockerAlert({ lang: 'en', ...base });
    const content = msg.blocks.flatMap((b) => (b.type === 'paragraph' ? b.content : []));
    expect(content).toContainEqual({ mention: 'UCAROL' });
    expect(content).toContain('@dave');
    expect(content).not.toContainEqual({ mention: 'Alice' });
  });

  test('portuguese alert uses the pt-BR copy and date format', () => {
    const msg = buildBlockerAlert({ lang: 'pt-BR', ...base });
    const text = msg.fallbackText;
    expect(text).toContain('Impedimento aberto há 6 dias · Alpha');
    expect(text).toContain('Aberto desde 22/10/2026, informado por @Alice.');
    expect(text).toContain('Encaminhado para @bob, @erin.');
  });

  test('one day is singular', () => {
    expect(buildBlockerAlert({ lang: 'en', ...base, ageDays: 1 }).fallbackText).toContain(
      'Blocker open for 1 day · Alpha',
    );
    expect(buildBlockerAlert({ lang: 'pt-BR', ...base, ageDays: 1 }).fallbackText).toContain(
      'Impedimento aberto há 1 dia · Alpha',
    );
  });

  test('leaves out the link and the routing when unknown', () => {
    const msg = buildBlockerAlert({
      lang: 'en',
      ...base,
      blocker: { text: 'no access to prod logs' },
      routedTo: [],
    });
    expect(msg.fallbackText).not.toContain('http');
    expect(msg.fallbackText).not.toContain('Routed to');
  });

  test('does not count or rank people', () => {
    const text = buildBlockerAlert({ lang: 'en', ...base }).fallbackText.toLowerCase();
    expect(text).not.toMatch(/\d+ blockers?/);
    expect(text).not.toContain('times');
  });
});
