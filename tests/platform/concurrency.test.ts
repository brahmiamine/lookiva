import { describe, expect, it } from 'vitest';
import { createSemaphore } from '@/platform/concurrency';

describe('createSemaphore', () => {
  it('never_runs_more_than_max_at_once_and_runs_everything', async () => {
    const s = createSemaphore(2);
    let now = 0;
    let seen = 0;
    const done: number[] = [];
    await Promise.all(
      Array.from({ length: 7 }, (_, i) =>
        s.run(async () => {
          seen = Math.max(seen, ++now);
          await new Promise((r) => setTimeout(r, 5));
          now--;
          done.push(i);
        }),
      ),
    );
    expect(seen).toBe(2);
    expect(done.sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(s.stats()).toEqual({ active: 0, peak: 2, waiting: 0 });
  });

  it('releases_the_slot_when_a_task_throws', async () => {
    const s = createSemaphore(1);
    await expect(s.run(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(await s.run(async () => 'ok')).toBe('ok');
    expect(s.stats().active).toBe(0);
  });
});
