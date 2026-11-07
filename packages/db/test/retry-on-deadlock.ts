const DEADLOCK = '40P01';

export function isDeadlock(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current = error;
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    if ('code' in current && current.code === DEADLOCK) return true;
    current = 'cause' in current ? current.cause : undefined;
  }
  return false;
}

export async function retryOnDeadlock<T>(run: () => Promise<T>, attempts = 5): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (!isDeadlock(error) || attempt >= attempts) throw error;
    }
  }
}
