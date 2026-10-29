import { z } from 'zod';
import { problemSchema } from '@/platform/http/errors';
import { registerRoute } from '@/platform/openapi/registry';
import * as s from './search-schemas';
const json = (description: string, schema: z.ZodType) => ({ description, content: { 'application/json': { schema } } });
const problem = (description: string) => ({ description, content: { 'application/problem+json': { schema: problemSchema } } });
const security = [{ sessionCookie: [] }];
const csrf = z.object({ 'X-Requested-With': z.literal('lookiva') });
const errors = { 400: problem('VALIDATION_ERROR, INVALID_JSON or INVALID_CURSOR (restart after query or source changes)'), 401: problem('UNAUTHENTICATED'), 429: problem('RATE_LIMITED (30/min/user)'), 503: problem('RATE_LIMITER_UNAVAILABLE or SEARCH_CAPACITY_EXCEEDED (>5000 candidate garments)') };
export function registerSearchOpenApi() {
  for (const method of ['get', 'post'] as const) registerRoute({
    method, path: '/api/v1/search/garments', tags: ['search'], security,
    summary: 'Private FR/EN/AR text search over live own non-trashed garments, catalog aliases, notes and organizer names. Structured filters always intersect inferred catalog properties. Text mode only (no embedding provider or photo analysis); relevance score is deterministic, not a probability. Cursor is bound to the same query and owner; no query is persisted',
    request: method === 'get' ? { query: s.searchQuery } : { headers: csrf, body: { content: { 'application/json': { schema: s.searchQuery } } } },
    responses: { 200: json('Ranked results and exact/estimated interpretation', s.searchResponse), ...errors, ...(method === 'post' ? { 403: problem('CSRF_REJECTED'), 413: problem('PAYLOAD_TOO_LARGE') } : {}) },
  });
  registerRoute({
    method: 'get', path: '/api/v1/search/suggestions', tags: ['search'], security,
    summary: 'Versioned catalog interpretation of a query; no private aggregates, history or provider calls',
    request: { query: s.suggestionsQuery }, responses: { 200: json('Interpretation', z.object({ dictionaryVersion: z.string(), interpretation: s.interpretation })), ...errors },
  });
  registerRoute({
    method: 'post', path: '/api/v1/search/outfit-draft', tags: ['search'], security,
    summary: 'Revalidates 1..30 unique own, non-trashed selected garments. Returns ids and unavailability warnings only; saves no outfit and changes no garment status',
    request: { headers: csrf, body: { content: { 'application/json': { schema: s.draftBody } } } },
    responses: { 200: json('Preparation only; saved=false', s.draftResponse), ...errors, 403: problem('CSRF_REJECTED'), 404: problem('NOT_FOUND (unknown, foreign or trashed garment)'), 413: problem('PAYLOAD_TOO_LARGE') },
  });
}
