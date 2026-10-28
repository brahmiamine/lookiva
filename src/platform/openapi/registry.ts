import { OpenAPIRegistry, extendZodWithOpenApi, type RouteConfig } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

// Once, at module load: adds `.openapi()` to every Zod schema.
extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

export type RouteDoc = {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  path: string;
  request?: unknown;
  responses: Record<number, unknown>;
  // Free-form OpenAPI fields (summary, tags, security...) pass through untouched.
  [extra: string]: unknown;
};

/** Thin wrapper over the zod-to-openapi registry. `request`/`responses` take Zod-based OpenAPI configs. */
export function registerRoute(r: RouteDoc): void {
  registry.registerPath(r as unknown as RouteConfig);
}
