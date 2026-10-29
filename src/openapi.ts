import { registerAnalyticsOpenApi } from '@/modules/analytics';
import { registerNotificationsOpenApi } from '@/modules/notifications';
import { registerPlanningOpenApi } from '@/modules/planning';
// Single entry of the OpenAPI document: imports every module that registers routes (platform cannot import modules).
import '@/modules/identity';
import '@/modules/wardrobe';
import '@/modules/outfits';
import '@/modules/recommendations';
import { registerSearchOpenApi } from '@/modules/wardrobe';

registerSearchOpenApi();
registerPlanningOpenApi();

export { buildOpenApi, openapiDiffers, renderOpenApi, type OpenAPIObject } from '@/platform/openapi/build';

registerAnalyticsOpenApi();
registerNotificationsOpenApi();
