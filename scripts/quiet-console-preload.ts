import { afterEach, beforeEach, expect } from 'bun:test';
import { createErrorBuffer, createMatcherGuard } from './quiet-console';

const original = console.error.bind(console);
const buffer = createErrorBuffer((...args) => original(...args));
console.error = ((...args: unknown[]) => buffer.write(...args)) as typeof console.error;

const guard = createMatcherGuard(() => buffer.fail());
const proto = Object.getPrototypeOf(expect(0)) as object;
for (const name of Object.getOwnPropertyNames(proto)) {
  if (name === 'constructor') continue;
  const descriptor = Object.getOwnPropertyDescriptor(proto, name);
  if (!descriptor || typeof descriptor.value !== 'function' || descriptor.writable === false)
    continue;
  descriptor.value = guard(descriptor.value);
  Object.defineProperty(proto, name, descriptor);
}

beforeEach(() => buffer.begin());
afterEach(() => buffer.end());
