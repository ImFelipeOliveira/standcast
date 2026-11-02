import { describe, expect, test } from 'bun:test';
import { redact } from '../../src/draft/redact';

describe('redact', () => {
  test('replaces known token shapes', () => {
    expect(redact('key sk-abcdefghijklmnop1234 here')).toBe('key [redacted] here');
    expect(redact('sk-proj_ABCDEFGHIJKLMNOP')).toBe('[redacted]');
    expect(redact('ghp_abcdefghijklmnopqrst')).toBe('[redacted]');
    expect(redact('gho_ABCDEFGHIJKLMNOPQRST and ghs_abcdefghijklmnopqrst')).toBe(
      '[redacted] and [redacted]',
    );
    expect(redact('xoxb-1234567890-abc')).toBe('[redacted]');
    expect(redact('sck_abcdefghijklmnop')).toBe('[redacted]');
    expect(redact('sc_abcdefghijklmnop')).toBe('[redacted]');
    expect(redact('aws AKIAABCDEFGHIJKLMNOP')).toBe('aws [redacted]');
  });

  test('replaces long mixed runs', () => {
    expect(redact('token: aGVsbG8gd29ybGQgaGVsbG8gd29ybGQ1234== end')).toBe(
      'token: [redacted] end',
    );
    expect(redact('key 9fQx2LmZ7pRt4WvB8nKc3HdJ6sYa1GeU0iOb end')).toBe('key [redacted] end');
  });

  test('keeps ordinary text', () => {
    expect(redact('Fix the cart total rounding')).toBe('Fix the cart total rounding');
    expect(redact('sk-short')).toBe('sk-short');
    expect(redact('ghp_short')).toBe('ghp_short');
    expect(redact('a'.repeat(40))).toBe('a'.repeat(40));
    expect(redact('1'.repeat(40))).toBe('1'.repeat(40));
    expect(redact('abc123')).toBe('abc123');
    expect(redact('see apps/cli/src/v2/components/item42/view1234/index.ts')).toBe(
      'see apps/cli/src/v2/components/item42/view1234/index.ts',
    );
    expect(redact('the release-2026-11-01-draft-from-sessions-rollout-plan')).toBe(
      'the release-2026-11-01-draft-from-sessions-rollout-plan',
    );
    expect(redact('sha 3f2a9c0b7d1e4f5a6b8c9d0e1f2a3b4c5d6e7f80')).toBe(
      'sha 3f2a9c0b7d1e4f5a6b8c9d0e1f2a3b4c5d6e7f80',
    );
    expect(redact('ABCDEFGHIJKLMNOPqrstuvwxyz12abcdefgh')).toBe(
      'ABCDEFGHIJKLMNOPqrstuvwxyz12abcdefgh',
    );
  });
});
