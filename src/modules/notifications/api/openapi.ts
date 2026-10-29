import { z } from 'zod';
import { registerRoute } from '@/platform/openapi/registry';
import { problemSchema } from '@/platform/http/errors';
import { preferenceBody } from './http';
const json = (schema: z.ZodType) => ({ description: 'Result', content: { 'application/json': { schema } } });
const problem = { description: 'Validation, session, CSRF, rate limit or capacity error', content: { 'application/problem+json': { schema: problemSchema } } };
const csrf = z.object({ 'X-Requested-With': z.literal('lookiva') });
export function registerNotificationsOpenApi() {
    const base = { tags: ['notifications'], security: [{ sessionCookie: [] }], responses: { 400: problem, 401: problem, 403: problem, 429: problem, 503: problem } };
    registerRoute({ ...base, method: 'get', path: '/api/v1/notifications', summary: 'Own unexpired, non-dismissed notifications with current source revalidation. Cursor pagination can contain empty pages after cancellation; follow nextCursor', request: { query: z.object({ limit: z.number().int().min(1).max(100).optional(), cursor: z.string().optional() }) }, responses: { ...base.responses, 200: json(z.object({ items: z.array(z.object({ id: z.uuid(), code: z.literal('OUTFIT_DUE'), outfitId: z.uuid(), startsAt: z.string(), readAt: z.string().nullable(), createdAt: z.string() })), nextCursor: z.string().optional() })) } });
    registerRoute({ ...base, method: 'post', path: '/api/v1/notifications/refresh', summary: 'Generate due reminders of own PLANNED outfits only when opted in. Stable dedupe persists dismissals; no push or external message. Repeats are safe', request: { headers: csrf }, responses: { ...base.responses, 200: json(z.object({ created: z.number() })) } });
    for (const method of ['get', 'put'] as const)
        registerRoute({ ...base, method, path: '/api/v1/notifications/preferences', summary: 'In-app reminders opt-in (default false); 15–1440 minutes before outfits. No push permission or transport', request: method === 'put' ? { headers: csrf, body: { content: { 'application/json': { schema: preferenceBody } } } } : undefined, responses: { ...base.responses, 200: json(preferenceBody.extend({ pushAvailable: z.literal(false) })), 413: problem } });
    for (const [method, suffix] of [['put', '/read'], ['delete', '']] as const)
        registerRoute({ ...base, method, path: `/api/v1/notifications/{id}${suffix}`, summary: method === 'put' ? 'Mark own notification read' : 'Dismiss own notification (dedupe tombstone retained until 90-day expiry)', request: { headers: csrf, params: z.object({ id: z.uuid() }) }, responses: { ...base.responses, 204: { description: 'Updated' }, 404: problem } });
}
