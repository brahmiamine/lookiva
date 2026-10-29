// Public surface of the identity module (the only file other code may import).
import './api/openapi'; // registers the identity routes in the OpenAPI registry
export { createIdentityHttp, type IdentityConfig, type IdentityHttp, type IdentityHttpDeps, type SessionContext, type SessionHandler } from './api/http';
export { identityRoutes, withSession } from './api/default';
export type { Me, SessionView } from './application/service';
export type { Preferences } from './application/ports';
export { purgeEmailTokens } from './infrastructure/prisma-store';
import type { PrismaClient } from '@/generated/prisma/client';
import type { OwnerId } from '@/platform/kernel';
import { createPrismaIdentityStore } from './infrastructure/prisma-store';
import type { Preferences } from './application/ports';

/** Read-only access to a user's preferences for other modules (location, thermal sensitivity, AI consent flag, personalization). */
export const createPreferencesReader = (db: PrismaClient) => {
  const store = createPrismaIdentityStore(db);
  return { get: (ownerId: OwnerId): Promise<Preferences | null> => store.getPreferences(ownerId) };
};
export type PreferencesReader = ReturnType<typeof createPreferencesReader>;
