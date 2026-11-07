export type ErrorBuffer = {
  write(...args: unknown[]): void;
  begin(): void;
  fail(): void;
  end(): void;
};

export function createErrorBuffer(emit: (...args: unknown[]) => void): ErrorBuffer {
  let capturing = false;
  let failed = false;
  let lines: unknown[][] = [];
  return {
    write(...args) {
      if (capturing) lines.push(args);
      else emit(...args);
    },
    begin() {
      capturing = true;
      failed = false;
      lines = [];
    },
    fail() {
      failed = true;
    },
    end() {
      const replay = failed ? lines : [];
      capturing = false;
      failed = false;
      lines = [];
      for (const line of replay) emit(...line);
    },
  };
}

export function createMatcherGuard(onFailure: () => void) {
  let depth = 0;
  return function guard<T extends (...args: never[]) => unknown>(original: T): T {
    return function guarded(this: unknown, ...args: never[]): unknown {
      const outer = depth === 0;
      depth += 1;
      const finish = (error?: unknown) => {
        depth -= 1;
        if (error !== undefined && outer) onFailure();
      };
      try {
        const result = original.apply(this, args);
        if (isPromise(result)) {
          return result.then(
            (value) => {
              finish();
              return value;
            },
            (error: unknown) => {
              finish(error);
              throw error;
            },
          );
        }
        finish();
        return result;
      } catch (error) {
        finish(error);
        throw error;
      }
    } as T;
  };
}

function isPromise(value: unknown): value is Promise<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}
