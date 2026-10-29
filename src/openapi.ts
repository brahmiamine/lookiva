// Single entry of the OpenAPI document: imports every module that registers routes (platform cannot import modules).
import '@/modules/identity';

export { buildOpenApi, openapiDiffers, renderOpenApi, type OpenAPIObject } from '@/platform/openapi/build';
