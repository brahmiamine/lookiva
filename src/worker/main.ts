import { createNotificationJob } from '@/modules/notifications';
// Process entry of the worker container. Kept apart from index.ts so tests can import startWorker without side effects.
import { writeFileSync } from 'node:fs';
import { getEnv } from '@/platform/env';
import { createWardrobePurge } from '@/modules/wardrobe';
import { createDb } from '@/platform/db';
import { createLogger } from '@/platform/logger';
import { LocalObjectStorage } from '@/platform/storage/local';
import { startWorker } from './index';

const HEARTBEAT_FILE = '/tmp/worker-alive';
const HEARTBEAT_MS = 10_000;

const env = getEnv();
const log = createLogger({ level: env.LOG_LEVEL });

const db = createDb(env.DATABASE_URL);
const purgeTrash = createWardrobePurge({ db, storage: new LocalObjectStorage(env.STORAGE_LOCAL_DIR), log });

// Business jobs: later phases register their handlers here.
const worker = await startWorker({
  redisUrl: env.REDIS_URL,
  handlers: { 'notifications-refresh': async () => { await createNotificationJob(db,err=>log.error({err},'notification owner refresh failed'))(new Date()); }, 'wardrobe-purge': async () => void (await purgeTrash(new Date())) },
  schedules: [{ queue: 'wardrobe-purge', everyMs: 86_400_000 }, { queue: 'notifications-refresh', everyMs: 300_000 }],
  onError: (err) => log.error({ err }, 'worker error'),
});

// Compose healthcheck reads the mtime of this file.
const beat = () => writeFileSync(HEARTBEAT_FILE, String(Date.now()));
beat();
const timer = setInterval(beat, HEARTBEAT_MS);
log.info('worker started');

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  log.info({ signal }, 'worker stopping');
  clearInterval(timer);
  try {
    await worker.close();
    await db.$disconnect();
    log.info('worker stopped');
    process.exit(0);
  } catch (err) {
    log.error({ err }, 'worker failed to stop cleanly');
    process.exit(1);
  }
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
