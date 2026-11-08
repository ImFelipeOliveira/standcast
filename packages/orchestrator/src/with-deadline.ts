export function withDeadline<T>(
  work: Promise<T>,
  timeoutMs: number,
  timeoutError: () => unknown = () => new Error(`timed out after ${timeoutMs}ms`),
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(timeoutError()), timeoutMs);
  });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}
