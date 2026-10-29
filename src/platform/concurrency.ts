/** Counting semaphore: at most `max` tasks run at once, the others wait in FIFO order. */
export function createSemaphore(max: number) {
  let active = 0;
  let peak = 0;
  const waiting: (() => void)[] = [];
  return {
    async run<T>(fn: () => Promise<T>): Promise<T> {
      if (active >= max) await new Promise<void>((resolve) => waiting.push(resolve));
      else active++;
      peak = Math.max(peak, active);
      try {
        return await fn();
      } finally {
        const next = waiting.shift();
        if (next) next(); // the slot passes straight to the next waiter
        else active--;
      }
    },
    stats: () => ({ active, peak, waiting: waiting.length }),
  };
}
export type Semaphore = ReturnType<typeof createSemaphore>;

/** Process-wide budget for CPU/RAM heavy image work (decode, derive, background removal). */
export const IMAGE_SLOTS = 2;
export const imageWork = createSemaphore(IMAGE_SLOTS);
