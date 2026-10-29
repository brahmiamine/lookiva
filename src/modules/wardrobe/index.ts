// Public surface of the wardrobe module (the only file other code may import).
import './api/openapi'; // registers the wardrobe routes in the OpenAPI registry
export { createWardrobeHttp, type WardrobeHttp, type WardrobeHttpDeps } from './api/http';
export { wardrobeRoutes } from './api/default';
export { GARMENT_STATUSES, isRecommendable, type GarmentStatus } from './domain/status';
export type { GarmentView } from './application/ports';
