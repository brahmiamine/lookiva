import { z } from 'zod';
import { registerRoute } from '@/platform/openapi/registry';
import { problemSchema } from '@/platform/http/errors';
import { eventBody, tripBody, windowQuery } from './schemas';
const json = (schema: z.ZodType) => ({ description: 'Result', content: { 'application/json': { schema } } });
const problem = { description: 'Validation, access, concurrency, rate limit or infrastructure error', content: { 'application/problem+json': { schema: problemSchema } } };
const csrf = z.object({ 'X-Requested-With': z.literal('lookiva') });
export function registerPlanningOpenApi() {
    for (const [path, payload] of [['events', eventBody], ['trips', tripBody]] as const) {
        const entry = z.object({ id: z.uuid(), payload, version: z.number().int(), createdAt: z.string(), updatedAt: z.string() });
        const common = { tags: ['planning'], security: [{ sessionCookie: [] }], responses: { 400: problem, 401: problem, 403: problem, 404: problem, 409: problem, 428: problem, 429: problem, 503: problem } };
        registerRoute({ ...common, method: 'get', path: `/api/v1/${path}`, summary: 'Own planning entries, newest first; limit/cursor pagination', request: { query: z.object({ limit: z.number().int().min(1).max(100).optional(), cursor: z.string().optional() }) }, responses: { ...common.responses, 200: json(z.object({ items: z.array(entry), nextCursor: z.string().optional() })) } });
        registerRoute({ ...common, method: 'post', path: `/api/v1/${path}`, summary: 'Create own planning document; no garment state or wear record is changed', request: { headers: csrf.extend({ 'Idempotency-Key': z.string() }), body: { content: { 'application/json': { schema: payload } } } }, responses: { ...common.responses, 201: json(entry), 413: problem, 422: problem } });
        for (const method of ['get', 'put', 'delete'] as const)
            registerRoute({ ...common, method, path: `/api/v1/${path}/{id}`, summary: 'Own document; PUT replaces the complete document, writes require If-Match', request: { params: z.object({ id: z.uuid() }), ...(method !== 'get' ? { headers: csrf.extend({ 'If-Match': z.string() }) } : {}), ...(method === 'put' ? { body: { content: { 'application/json': { schema: payload } } } } : {}) }, responses: { ...common.responses, ...(method === 'delete' ? { 204: { description: 'Deleted' } } : { 200: json(entry) }), 413: problem } });
    }
    registerRoute({ method: 'get', path: '/api/v1/events/{id}/occurrences', tags: ['planning'], security: [{ sessionCookie: [] }], summary: 'Virtual all-day local occurrences, at most 366 days per request; no reminders or wear records are created', request: { params: z.object({ id: z.uuid() }), query: windowQuery }, responses: { 200: json(z.object({ items: z.array(z.object({ key: z.string(), date: z.string(), timezone: z.string(), title: z.string(), allDay: z.literal(true) })) })), 400: problem, 401: problem, 404: problem, 429: problem } });
    registerRoute({ method: 'get', path: '/api/v1/trips/{id}/packing-suggestion', tags: ['planning'], security: [{ sessionCookie: [] }], summary: 'Distinct selected physical pieces, capacity warning, missing/unavailable warnings and checklist. Weight is explicitly unknown. Never changes status', request: { params: z.object({ id: z.uuid() }) }, responses: { 200: json(z.object({ garmentIds: z.array(z.uuid()), pieces: z.number(), overCapacity: z.boolean(), weightKnown: z.literal(false), warnings: z.array(z.object({ id: z.uuid(), code: z.enum(['MISSING', 'UNAVAILABLE']) })), checklist: z.array(z.object({ id: z.uuid(), text: z.string(), done: z.boolean() })) })), 401: problem, 404: problem, 429: problem } });
}
