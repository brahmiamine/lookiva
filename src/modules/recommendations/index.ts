// Public surface of the recommendations module (the only file other code may import).
import './api/openapi'; // registers the routes in the OpenAPI registry
export { createRecommendationsHttp, type RecommendationsHttp, type RecommendationsHttpDeps } from './api/http';
export { recommendationsRoutes } from './api/default';
export { OCCASIONS, type Occasion } from './domain/engine';
