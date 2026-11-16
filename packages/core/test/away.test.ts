import { describe, expect, test } from 'bun:test';
import { buildAwayNotice, MAX_AWAY_DAYS, validateAwayPeriod } from '../src/away';

const today = '2026-11-16';

describe('validateAwayPeriod', () => {
  test('accepts a future period', () => {
    expect(validateAwayPeriod({ from: '2026-12-01', until: '2026-12-05', today })).toBe('ok');
  });

  test('accepts a period starting today', () => {
    expect(validateAwayPeriod({ from: today, until: today, today })).toBe('ok');
  });

  test('accepts exactly the maximum length', () => {
    expect(MAX_AWAY_DAYS).toBe(90);
    expect(validateAwayPeriod({ from: '2026-12-01', until: '2027-02-28', today })).toBe('ok');
  });

  test('rejects a period over the maximum length', () => {
    expect(validateAwayPeriod({ from: '2026-12-01', until: '2027-03-01', today })).toBe(
      'invalid_away_period',
    );
  });

  test('rejects until before from', () => {
    expect(validateAwayPeriod({ from: '2026-12-05', until: '2026-12-01', today })).toBe(
      'invalid_away_period',
    );
  });

  test('rejects from before today', () => {
    expect(validateAwayPeriod({ from: '2026-11-15', until: '2026-11-20', today })).toBe(
      'invalid_away_period',
    );
  });

  test('rejects an impossible from date with otherwise valid order and length', () => {
    expect(validateAwayPeriod({ from: '2027-02-27', until: '2027-03-05', today })).toBe('ok');
    expect(validateAwayPeriod({ from: '2027-02-30', until: '2027-03-05', today })).toBe(
      'invalid_away_period',
    );
  });

  test('rejects an impossible until date with otherwise valid order and length', () => {
    expect(validateAwayPeriod({ from: '2027-02-20', until: '2027-02-28', today })).toBe('ok');
    expect(validateAwayPeriod({ from: '2027-02-20', until: '2027-02-30', today })).toBe(
      'invalid_away_period',
    );
  });

  test('rejects malformed dates', () => {
    expect(validateAwayPeriod({ from: '2026-12-1', until: '2026-12-05', today })).toBe(
      'invalid_away_period',
    );
  });
});

describe('buildAwayNotice', () => {
  const base = {
    by: 'bob',
    from: '2026-12-01',
    until: '2026-12-05',
    periodId: 'abc-123',
    org: 'acme',
  };

  test('pt-BR marked notice', () => {
    const text = buildAwayNotice('pt-BR', { ...base, action: 'marked' });
    expect(text).toContain('@bob marcou você de férias de 01/12/2026 a 05/12/2026');
    expect(text).toContain('`standcast away cancel abc-123 --org acme`');
  });

  test('en marked notice', () => {
    const text = buildAwayNotice('en', { ...base, action: 'marked' });
    expect(text).toContain('marked you away from 2026-12-01 to 2026-12-05');
    expect(text).toContain('`standcast away cancel abc-123 --org acme`');
  });

  test('cancelled notice in both languages', () => {
    expect(buildAwayNotice('en', { ...base, action: 'cancelled' })).toBe(
      '@bob cancelled your away period from 2026-12-01 to 2026-12-05.',
    );
    expect(buildAwayNotice('pt-BR', { ...base, action: 'cancelled' })).toBe(
      '@bob cancelou as suas férias de 01/12/2026 a 05/12/2026.',
    );
  });
});
