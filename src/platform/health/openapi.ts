import { problemSchema } from '@/platform/http/errors';
import { registry, registerRoute } from '@/platform/openapi/registry';
import { healthResponseSchema, readyResponseSchema } from './schemas';

registry.registerComponent('securitySchemes', 'readyToken', { type: 'http', scheme: 'bearer' });

const problem = (description: string) => ({
  description,
  content: { 'application/problem+json': { schema: problemSchema } },
});

registerRoute({
  method: 'get',
  path: '/api/v1/health',
  summary: 'Liveness (no dependency access)',
  responses: {
    200: { description: 'Process is alive', content: { 'application/json': { schema: healthResponseSchema } } },
  },
});

registerRoute({
  method: 'get',
  path: '/api/v1/ready',
  summary: 'Readiness (database + Redis), protected by bearer token',
  security: [{ readyToken: [] }],
  responses: {
    200: { description: 'All dependencies reachable', content: { 'application/json': { schema: readyResponseSchema } } },
    401: problem('Missing or invalid bearer token'),
    503: problem('A dependency is unavailable (errors[].path names it)'),
  },
});
