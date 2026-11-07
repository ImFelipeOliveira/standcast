import { describe, expect, test } from 'bun:test';
import { isDeadlock, retryOnDeadlock } from './retry-on-deadlock';

const deadlock = Object.assign(new Error('deadlock detected'), { code: '40P01' });

describe('retryOnDeadlock', () => {
  test('a postgres deadlock code counts through the cause chain', () => {
    expect(isDeadlock(deadlock)).toBe(true);
    expect(isDeadlock(new Error('deadlock detected', { cause: deadlock }))).toBe(true);
    expect(isDeadlock(Object.assign(new Error('other'), { code: '23505' }))).toBe(false);
    expect(isDeadlock(new Error('deadlock detected'))).toBe(false);
  });

  test('a deadlock is tried again and any other error is not', async () => {
    let calls = 0;
    const value = await retryOnDeadlock(async () => {
      calls += 1;
      if (calls === 1) throw deadlock;
      return 'clean';
    });
    expect(value).toBe('clean');
    expect(calls).toBe(2);

    await expect(retryOnDeadlock(async () => Promise.reject(new Error('other')))).rejects.toThrow(
      'other',
    );
    await expect(retryOnDeadlock(async () => Promise.reject(deadlock), 2)).rejects.toThrow(
      'deadlock detected',
    );
  });
});
