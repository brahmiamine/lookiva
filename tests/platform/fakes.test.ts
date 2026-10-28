import { describe, expect, it } from 'vitest';
import { createFakePlatform, FakeClock, FakeEmail, FakeQueue, FakeStorage } from '@/platform';

describe('platform fakes', () => {
  it('fake_email_records_sent_messages', async () => {
    const email = new FakeEmail();
    await email.send({ to: 'a@example.com', subject: 's', text: 't' });
    expect(email.sent).toEqual([{ to: 'a@example.com', subject: 's', text: 't' }]);
  });

  it('fake_queue_dedupes_same_jobId', async () => {
    const queue = new FakeQueue();
    await queue.enqueue('q', { n: 1 }, { jobId: 'j1' });
    await queue.enqueue('q', { n: 2 }, { jobId: 'j1' });
    await queue.enqueue('q', { n: 3 }, { jobId: 'j2' });
    expect(queue.jobs.map((j) => j.payload)).toEqual([{ n: 1 }, { n: 3 }]);
  });

  it('fake_storage_signed_url_expires_after_ttl', async () => {
    const clock = new FakeClock(new Date('2026-01-01T00:00:00Z'));
    const storage = new FakeStorage(clock);
    await storage.put('k', new Uint8Array([1, 2]), 'application/octet-stream');
    const url = await storage.getSignedUrl('k', 60);
    expect(storage.fetchSigned(url)).toEqual(new Uint8Array([1, 2]));
    clock.advance(61_000);
    expect(storage.fetchSigned(url)).toBeNull();
  });

  it('fake_clock_is_settable', () => {
    const p = createFakePlatform();
    const clock = p.clock as FakeClock;
    clock.set(new Date('2030-05-05T10:00:00Z'));
    expect(p.clock.now().toISOString()).toBe('2030-05-05T10:00:00.000Z');
    clock.advance(1000);
    expect(p.clock.now().toISOString()).toBe('2030-05-05T10:00:01.000Z');
  });
});
