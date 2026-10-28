import { OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import '@/platform/health/openapi'; // registers /health and /ready at import
import { registry } from './registry';

// The library does not re-export openapi3-ts types; derive instead of adding a dependency.
export type OpenAPIObject = ReturnType<OpenApiGeneratorV31['generateDocument']>;

export function buildOpenApi(): OpenAPIObject {
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: { title: 'Lookiva API', version: '0.1.0' },
  });
}

/** Canonical text of the committed `openapi.json`. */
export const renderOpenApi = (doc: OpenAPIObject): string => JSON.stringify(doc, null, 2) + '\n';

export const openapiDiffers = (committedText: string, doc: OpenAPIObject): boolean =>
  committedText !== renderOpenApi(doc);
