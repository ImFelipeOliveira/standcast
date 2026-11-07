import { describe, expect, test } from 'bun:test';
import { createErrorBuffer, createMatcherGuard } from './quiet-console';

describe('quiet console', () => {
  test('keeps logs from a passing test and replays them after a failure', () => {
    const emitted: unknown[][] = [];
    const buffer = createErrorBuffer((...args) => {
      emitted.push(args);
    });

    buffer.begin();
    buffer.write('hidden', { code: 'down' });
    buffer.end();
    expect(emitted).toEqual([]);

    buffer.begin();
    buffer.write('shown', { code: 'down' });
    buffer.fail();
    buffer.end();
    expect(emitted).toEqual([['shown', { code: 'down' }]]);
  });

  test('lets logs through outside a test', () => {
    const emitted: unknown[][] = [];
    const buffer = createErrorBuffer((...args) => {
      emitted.push(args);
    });
    buffer.write('startup');
    expect(emitted).toEqual([['startup']]);
  });

  test('does not treat an inner matcher failure caught by an outer matcher as a test failure', () => {
    let failures = 0;
    const guard = createMatcherGuard(() => {
      failures += 1;
    });
    const inner = guard((ok: boolean) => {
      if (!ok) throw new Error('inner');
    });
    const outer = guard((run: () => void) => {
      try {
        run();
        return 'caught';
      } catch {
        return 'caught';
      }
    });
    expect(outer(() => inner(false))).toBe('caught');
    expect(failures).toBe(0);
    expect(() => outer(() => inner(true))).not.toThrow();
    expect(() =>
      guard((ok: boolean) => {
        if (!ok) throw new Error('outer');
      })(false),
    ).toThrow('outer');
    expect(failures).toBe(1);
  });
});
