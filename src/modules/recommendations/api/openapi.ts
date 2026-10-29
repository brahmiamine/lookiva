import { z } from 'zod';
import { problemSchema } from '@/platform/http/errors';
import { registerRoute, type RouteDoc } from '@/platform/openapi/registry';
import * as s from './schemas';

const problem = (description: string) => ({ description, content: { 'application/problem+json': { schema: problemSchema } } });
const json = (description: string, schema: z.ZodType) => ({ description, content: { 'application/json': { schema } } });
const body = (schema: z.ZodType) => ({ content: { 'application/json': { schema } } });
const csrf = z.object({ 'X-Requested-With': z.literal('lookiva') });
const idempotency = csrf.extend({ 'Idempotency-Key': z.string().regex(/^[A-Za-z0-9_-]{8,128}$/) });
const session = [{ sessionCookie: [] }];
const id = z.object({ id: z.uuid() });
const authed = { 401: problem('UNAUTHENTICATED'), 429: problem('RATE_LIMITED (Retry-After header; per user)') };
const NOT_FOUND = problem("NOT_FOUND (unknown or another user's resource)");
const BAD = problem('VALIDATION_ERROR or INVALID_JSON');
const route = (r: RouteDoc & { tags: string[] }) =>
  registerRoute({ ...r, responses: { ...r.responses, ...((r.request as { body?: unknown } | undefined)?.body ? { 413: problem('PAYLOAD_TOO_LARGE') } : {}) } });

route({
  method: 'get', path: '/api/v1/weather', tags: ['weather'], security: session,
  summary: 'Normalized forecast of a local day and hour window (default 8..20) for the profile city, or `cityOverride` for this request only. Cached (TTL) behind a provider quota. When unavailable the answer is 200 with `weatherAvailable: false` and a `reason` (NO_PROVIDER, NO_LOCATION, CITY_NOT_FOUND, QUOTA, TIMEOUT, PROVIDER_ERROR, NO_DATA): a forecast is never invented',
  request: { query: z.object({ date: z.string(), from: z.number().int().optional(), to: z.number().int().optional(), cityOverride: z.string().optional() }) },
  responses: { 200: json('Weather (or weatherAvailable:false)', s.weatherResponse), 400: BAD, ...authed },
});
route({
  method: 'post', path: '/api/v1/recommendations/outfits', tags: ['recommendations'], security: session,
  summary: 'Up to `count` (max 3) DISTINCT outfit proposals from own, non-trashed, AVAILABLE garments only; fewer when the wardrobe cannot make more (never padded). Deterministic rules (weather/occasion > comfort > styles/colors > variety); optional AI only re-orders rule candidates (AI_RECOMMENDATIONS consent + daily cap, photos never sent). Unknown garment properties are listed per proposal in `assumptions` (never saved). Nothing is saved except the shown fingerprints of the session: send `sessionId` for "another proposal"',
  request: { headers: csrf, body: body(s.recommendBody) },
  responses: { 200: json('Proposals (`exhausted: true` when fewer than requested; `manualFallback: true` when no weather)', s.recommendResponse), 400: BAD, 404: problem('NOT_FOUND (session unknown, expired or not yours)'), ...authed },
});
route({
  method: 'post', path: '/api/v1/recommendations/feedback', tags: ['recommendations'], security: session,
  summary: 'Records ACCEPT / REJECT / MODIFY of a proposal (garment ids snapshot; fingerprint computed by the server). Only influences ranking when preferences.personalization is true',
  request: { headers: idempotency, body: body(s.feedbackBody) },
  responses: { 201: json('Recorded', s.feedbackView), 400: problem('VALIDATION_ERROR or IDEMPOTENCY_KEY_*'), 404: problem('NOT_FOUND (a garment is unknown or not yours)'), 422: problem('IDEMPOTENCY_KEY_REUSED'), ...authed },
});
route({ method: 'delete', path: '/api/v1/recommendations/feedback', tags: ['recommendations'], security: session, summary: 'Deletes ALL own feedback (outfits are untouched)', request: { headers: csrf }, responses: { 200: json('Count', z.object({ deleted: z.number().int() })), ...authed } });
route({ method: 'delete', path: '/api/v1/recommendations/feedback/{id}', tags: ['recommendations'], security: session, summary: 'Deletes one feedback entry', request: { headers: csrf, params: id }, responses: { 204: { description: 'Deleted' }, ...authed, 404: NOT_FOUND } });
route({
  method: 'post', path: '/api/v1/outfits/{id}/weather-baseline', tags: ['recommendations'], security: session,
  summary: 'Remembers the forecast the outfit is planned against (send `{}` or a `cityOverride`). Needs a scheduled outfit (422 OUTFIT_NOT_SCHEDULED). Never changes the outfit',
  request: { headers: csrf, params: id, body: body(s.baselineBody) }, responses: { 200: json('Baseline stored (or weatherAvailable:false)', s.baselineResponse), 400: BAD, 422: problem('OUTFIT_NOT_SCHEDULED'), ...authed, 404: NOT_FOUND },
});
route({
  method: 'get', path: '/api/v1/outfits/{id}/weather-impact', tags: ['recommendations'], security: session,
  summary: 'Compares the stored baseline forecast with a fresh one using fixed thresholds (temperature >= 5 C, precipitation probability >= 30 points, wind >= 20 km/h). Returns warnings and suggestion codes only: the outfit is NEVER replaced (`replaced` is always false)',
  request: { params: id }, responses: { 200: json('Impact', s.impactResponse), 422: problem('OUTFIT_NOT_SCHEDULED'), ...authed, 404: NOT_FOUND },
});
