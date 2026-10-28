import type { Clock } from './port';

export const systemClock: Clock = { now: () => new Date() };
