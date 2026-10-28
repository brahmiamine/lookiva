// Process entry of the worker container. Kept apart from index.ts so tests can import startWorker without side effects.
import { writeFileSync } from 'node:fs';
import { getEnv } from '@/platform/env';
import { createLogger } from '@/platform/logger';
import { startWorker } from './index';

const HEARTBEAT_FILE = '/tmp/worker-alive';
const HEARTBEAT_MS = 10_000;

const env = getEnv();
const log = createLogger({ level: env.LOG_LEVEL });

// No business jobs yet: later phases register their handlers here.
const worker = await startWorker({ redisUrl: env.REDIS_URL, handlers: {} });

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
    log.info('worker stopped');
    process.exit(0);
  } catch (err) {
    log.error({ err }, 'worker failed to stop cleanly');
    process.exit(1);
  }
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
