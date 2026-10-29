// Single entry of the OpenAPI document: imports every module that registers routes (platform cannot import modules).
import '@/modules/identity';
import '@/modules/wardrobe';
import '@/modules/outfits';

export { buildOpenApi, openapiDiffers, renderOpenApi, type OpenAPIObject } from '@/platform/openapi/build';
