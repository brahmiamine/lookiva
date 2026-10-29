import { expect, it, vi } from 'vitest';
import type { PrismaClient } from '@/generated/prisma/client';
import { createNotificationJob } from '@/modules/notifications';
it('continues processing other opted-in owners after one owner reaches capacity', async () => {
    const queried: string[] = [];
    const db = { notification: { deleteMany: async () => ({ count: 0 }) }, notificationPreference: { findMany: async () => [{ ownerId: 'large' }, { ownerId: 'normal' }], findUnique: async () => ({ enabled: true, minutesBefore: 60 }) }, outfit: { findMany: async ({ where }: {
                where: {
                    ownerId: string;
                };
            }) => { queried.push(where.ownerId); return where.ownerId === 'large' ? Array.from({ length: 501 }, () => ({})) : []; } } } as unknown as PrismaClient;
    const failed = vi.fn();
    const result = await createNotificationJob(db, failed)(new Date());
    expect(queried).toEqual(['large', 'normal']);
    expect(failed).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ processed: 1, failed: 1 });
});
