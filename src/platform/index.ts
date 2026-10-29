import type { Ai } from './ai/port';
import type { Audit } from './audit/port';
import type { Clock } from './clock/port';
import type { Email } from './email/port';
import type { Embeddings } from './embeddings/port';
import type { Geocoder } from './geocoder/port';
import type { Queue } from './queue/port';
import type { Storage } from './storage/port';
import type { Weather } from './weather/port';
import { FakeAi } from './ai/fake';
import { FakeAudit } from './audit/fake';
import { FakeClock } from './clock/fake';
import { FakeEmail } from './email/fake';
import { FakeEmbeddings } from './embeddings/fake';
import { FakeGeocoder } from './geocoder/fake';
import { FakeQueue } from './queue/fake';
import { FakeStorage } from './storage/fake';
import { FakeWeather } from './weather/fake';

export type { Ai, Audit, Clock, Email, Embeddings, Geocoder, Queue, Storage, Weather };
export type { AuditEvent } from './audit/port';
export type { EmailMessage } from './email/port';
export { FakeAi, FakeAudit, FakeClock, FakeEmail, FakeEmbeddings, FakeGeocoder, FakeQueue, FakeStorage, FakeWeather };

export type Platform = {
  clock: Clock;
  queue: Queue;
  storage: Storage;
  weather: Weather;
  email: Email;
  embeddings: Embeddings;
  geocoder: Geocoder;
  ai: Ai;
  audit: Audit;
};

export function createFakePlatform(): Platform {
  const clock = new FakeClock();
  return {
    clock,
    queue: new FakeQueue(),
    storage: new FakeStorage(clock),
    weather: new FakeWeather(),
    email: new FakeEmail(),
    embeddings: new FakeEmbeddings(),
    geocoder: new FakeGeocoder(),
    ai: new FakeAi(),
    audit: new FakeAudit(),
  };
}
