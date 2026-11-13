import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createContext, runInContext } from 'node:vm';

const SCRIPT = readFileSync(join(import.meta.dir, '../public/app.js'), 'utf8');
const STEP = 1000 / 60;

type Listener = () => void;

class Target {
  private listeners = new Map<string, Listener[]>();

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  dispatch(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
}

class Query extends Target {
  constructor(public matches: boolean) {
    super();
  }

  set(matches: boolean): void {
    this.matches = matches;
    this.dispatch('change');
  }
}

class Toggle extends Target {
  hidden = true;
  private attributes = new Map<string, string>([['aria-pressed', 'false']]);

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  click(): void {
    this.dispatch('click');
  }
}

function fakeCanvas(onDraw: () => void) {
  const ink = {
    setTransform() {},
    clearRect: onDraw,
    drawImage() {},
    fillRect() {},
    fillStyle: '',
    globalAlpha: 1,
  };
  return { clientWidth: 1200, clientHeight: 600, width: 0, height: 0, getContext: () => ink };
}

function startField(options: { reduced?: boolean; paused?: boolean } = {}) {
  let draws = 0;
  let next = 1;
  let observed: ((entries: { isIntersecting: boolean }[]) => void) | undefined;
  const frames = new Map<number, (now: number) => void>();
  const stored = new Map<string, string>();
  if (options.paused) stored.set('standcast:field-paused', '1');
  const reduce = new Query(Boolean(options.reduced));
  const dark = new Query(false);
  const toggle = new Toggle();
  const canvas = fakeCanvas(() => {
    draws++;
  });
  const document = Object.assign(new Target(), {
    hidden: false,
    querySelector: (selector: string) =>
      selector === 'canvas.field' ? canvas : selector === 'button.field-toggle' ? toggle : null,
    querySelectorAll: () => [],
    getElementById: () => null,
    createElement: () => fakeCanvas(() => {}),
  });
  const window = Object.assign(new Target(), {
    document,
    navigator: {},
    devicePixelRatio: 1,
    scrollY: 0,
    localStorage: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
    },
    matchMedia: (query: string) => (query.includes('reduced-motion') ? reduce : dark),
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    requestAnimationFrame: (callback: (now: number) => void) => {
      frames.set(next, callback);
      return next++;
    },
    cancelAnimationFrame: (id: number) => {
      frames.delete(id);
    },
    ResizeObserver: class {
      observe() {}
    },
    IntersectionObserver: class {
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
        observed = callback;
      }
      observe() {}
    },
  });
  const context = createContext(window);
  runInContext('window = globalThis;', context);
  runInContext(SCRIPT, context);

  let now = 0;
  const run = (ms: number) => {
    const before = draws;
    for (const end = now + ms; now < end; ) {
      now += STEP;
      const pending = [...frames.entries()];
      frames.clear();
      for (const [, callback] of pending) callback(now);
    }
    return draws - before;
  };

  return {
    toggle,
    stored,
    run,
    pending: () => frames.size,
    see: (isIntersecting: boolean) => observed?.([{ isIntersecting }]),
    hide: (hidden: boolean) => {
      document.hidden = hidden;
      document.dispatch('visibilitychange');
    },
    reduce: (on: boolean) => reduce.set(on),
  };
}

describe('pixel field', () => {
  test('waits until the hero is on screen', () => {
    const field = startField();
    expect(field.pending()).toBe(0);
    expect(field.run(500)).toBe(0);
    field.see(true);
    expect(field.run(500)).toBeGreaterThan(0);
  });

  test('draws at most 30 frames a second on a 60 Hz screen', () => {
    const field = startField();
    field.see(true);
    const draws = field.run(2000);
    expect(draws).toBeLessThanOrEqual(61);
    expect(draws).toBeGreaterThanOrEqual(55);
  });

  test('pause button stops drawing, is remembered and resumes', () => {
    const field = startField();
    field.see(true);
    expect(field.toggle.hidden).toBe(false);
    field.toggle.click();
    expect(field.toggle.getAttribute('aria-pressed')).toBe('true');
    expect(field.stored.get('standcast:field-paused')).toBe('1');
    expect(field.pending()).toBe(0);
    expect(field.run(1000)).toBe(0);
    field.toggle.click();
    expect(field.toggle.getAttribute('aria-pressed')).toBe('false');
    expect(field.run(1000)).toBeGreaterThan(0);
  });

  test('starts paused when the visitor paused it before', () => {
    const field = startField({ paused: true });
    field.see(true);
    expect(field.toggle.getAttribute('aria-pressed')).toBe('true');
    expect(field.run(1000)).toBe(0);
  });

  test('stops while the tab is hidden', () => {
    const field = startField();
    field.see(true);
    field.run(200);
    field.hide(true);
    expect(field.pending()).toBe(0);
    expect(field.run(1000)).toBe(0);
    field.hide(false);
    expect(field.run(1000)).toBeGreaterThan(0);
  });

  test('stops when the hero scrolls off screen', () => {
    const field = startField();
    field.see(true);
    field.run(200);
    field.see(false);
    expect(field.pending()).toBe(0);
    expect(field.run(1000)).toBe(0);
  });

  test('never animates with reduced motion and hides the pause button', () => {
    const field = startField({ reduced: true });
    field.see(true);
    expect(field.toggle.hidden).toBe(true);
    expect(field.run(1000)).toBe(0);
  });

  test('stops when reduced motion is turned on while it runs', () => {
    const field = startField();
    field.see(true);
    field.run(200);
    field.reduce(true);
    expect(field.toggle.hidden).toBe(true);
    expect(field.pending()).toBe(0);
    expect(field.run(1000)).toBe(0);
    field.reduce(false);
    expect(field.toggle.hidden).toBe(false);
    expect(field.run(1000)).toBeGreaterThan(0);
  });
});
