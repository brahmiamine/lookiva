// Public surface of the identity module (the only file other code may import).
import './api/openapi'; // registers the identity routes in the OpenAPI registry
export { createIdentityHttp, type IdentityConfig, type IdentityHttp, type IdentityHttpDeps, type SessionContext, type SessionHandler } from './api/http';
export { identityRoutes, withSession } from './api/default';
export type { Me, SessionView } from './application/service';
export type { Preferences } from './application/ports';
