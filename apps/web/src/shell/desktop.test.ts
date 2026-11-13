import { describe, expect, test } from 'bun:test';
import { DESKTOP_QUERY, watchDesktop } from './desktop';

function fakeMedia(initial: boolean) {
  const listeners = new Set<(event: { matches: boolean }) => void>();
  const media = {
    matches: initial,
    addEventListener: (_type: 'change', listener: (event: { matches: boolean }) => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: 'change', listener: (event: { matches: boolean }) => void) => {
      listeners.delete(listener);
    },
  };
  const change = (matches: boolean) => {
    media.matches = matches;
    for (const listener of listeners) listener({ matches });
  };
  return { media, change, listeners };
}

describe('watchDesktop', () => {
  test('matches the desk breakpoint', () => {
    expect(DESKTOP_QUERY).toBe('(min-width: 900px)');
  });

  test('closes the drawer when the viewport widens past the desk breakpoint', () => {
    const { media, change } = fakeMedia(false);
    let closed = 0;
    watchDesktop(media, () => {
      closed += 1;
    });
    expect(closed).toBe(0);
    change(false);
    expect(closed).toBe(0);
    change(true);
    expect(closed).toBe(1);
  });

  test('closes right away when already on desktop', () => {
    const { media } = fakeMedia(true);
    let closed = 0;
    watchDesktop(media, () => {
      closed += 1;
    });
    expect(closed).toBe(1);
  });

  test('stops listening on cleanup', () => {
    const { media, change, listeners } = fakeMedia(false);
    let closed = 0;
    const stop = watchDesktop(media, () => {
      closed += 1;
    });
    stop();
    expect(listeners.size).toBe(0);
    change(true);
    expect(closed).toBe(0);
  });
});
