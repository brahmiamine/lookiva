import { z } from 'zod';
import { problemSchema } from '@/platform/http/errors';
import { registerRoute, type RouteDoc } from '@/platform/openapi/registry';
import * as s from './schemas';

const problem = (description: string) => ({ description, content: { 'application/problem+json': { schema: problemSchema } } });
const json = (description: string, schema: z.ZodType, etag = false) => ({
  description,
  content: { 'application/json': { schema } },
  ...(etag ? { headers: z.object({ ETag: z.string() }) } : {}),
});
const body = (schema: z.ZodType) => ({ content: { 'application/json': { schema } } });

const csrf = z.object({ 'X-Requested-With': z.literal('lookiva') });
const idempotency = csrf.extend({ 'Idempotency-Key': z.string().regex(/^[A-Za-z0-9_-]{8,128}$/) });
const ifMatch = csrf.extend({ 'If-Match': z.string() });
const session = [{ sessionCookie: [] }];
const id = z.object({ id: z.uuid() });
const item = z.object({ id: z.uuid(), garmentId: z.uuid() });
const page = z.object({ limit: z.number().int().min(1).max(100).optional(), cursor: z.string().optional() });

const authed = {
  401: problem('UNAUTHENTICATED (no, unknown, revoked or expired session)'),
  429: problem('RATE_LIMITED (Retry-After header; per user)'),
};
const NOT_FOUND = problem("NOT_FOUND (unknown or another user's resource)");
const BAD = problem('VALIDATION_ERROR or INVALID_JSON (or INVALID_CURSOR on lists)');
const STALE = problem('VERSION_CONFLICT (stale ETag; `*` is refused too)');
const MATCH = problem('IF_MATCH_REQUIRED');
const IDEM = {
  400: problem('VALIDATION_ERROR, INVALID_JSON, IDEMPOTENCY_KEY_REQUIRED or IDEMPOTENCY_KEY_INVALID'),
  422: problem('IDEMPOTENCY_KEY_REUSED (same key, different request)'),
};

const route = (r: RouteDoc & { tags: string[] }) =>
  registerRoute({ ...r, responses: { ...r.responses, ...((r.request as { body?: unknown } | undefined)?.body ? { 413: problem('PAYLOAD_TOO_LARGE (body over 16 KiB)') } : {}) } });

const out = ['outfits'];
const tpl = ['outfit-templates'];
const wear = ['wear-records'];

route({
  method: 'post', path: '/api/v1/outfits', tags: out, security: session,
  summary: 'Create an outfit (DRAFT may be incomplete: no date, no items). PLANNED needs startsAt (ISO with offset) + timezone (IANA) + occasion; the server derives localDate/localTime. Missing clothing roles come back as `warnings`, never as an error. Several outfits per day are allowed',
  request: { headers: idempotency, body: body(s.outfitCreateBody) },
  responses: { 201: json('Created (ETag W/"v1")', s.outfitView, true), ...IDEM, ...authed, 404: problem('NOT_FOUND (a garment is unknown, trashed or not yours; errors[] names each)'), 409: problem('IDEMPOTENCY_IN_PROGRESS') },
});
route({
  method: 'get', path: '/api/v1/outfits', tags: out, security: session,
  summary: 'With `from` and `to` (local dates YYYY-MM-DD, inclusive; day and week views): outfits of that range in chronological order (max 200, no cursor). Without: newest first with cursor pagination. Filter by status',
  request: { query: z.object({ from: z.string().optional(), to: z.string().optional(), status: z.string().optional() }).extend(page.shape) },
  responses: { 200: json('Outfits', s.outfitsPage), 400: BAD, ...authed },
});
route({ method: 'get', path: '/api/v1/outfits/last-worn', tags: out, security: session, summary: 'The last (default 3, max 10) outfits confirmed as worn, from ACTIVE wear records, newest first. Snapshots only: they survive garment edits, trash and purge and carry no photo', request: { query: z.object({ limit: z.number().int().min(1).max(10).optional() }) }, responses: { 200: json('Wear records', s.lastWornResponse), 400: BAD, ...authed } });
route({ method: 'get', path: '/api/v1/outfits/{id}', tags: out, security: session, summary: 'One outfit with advisory `warnings` (missing roles, trashed or not AVAILABLE garments)', request: { params: id }, responses: { 200: json('Outfit', s.outfitView, true), ...authed, 404: NOT_FOUND } });
route({
  method: 'patch', path: '/api/v1/outfits/{id}', tags: out, security: session,
  summary: 'Partial update guarded by If-Match (title, occasion, startsAt/endsAt/timezone, status DRAFT|PLANNED, items = full replacement). Only DRAFT and PLANNED outfits are editable',
  request: { headers: ifMatch, params: id, body: body(s.outfitPatchBody) },
  responses: { 200: json('Updated (new ETag)', s.outfitView, true), 400: BAD, ...authed, 404: NOT_FOUND, 409: problem('VERSION_CONFLICT or OUTFIT_NOT_EDITABLE (WORN / CANCELLED)'), 428: MATCH },
});
route({
  method: 'delete', path: '/api/v1/outfits/{id}', tags: out, security: session,
  summary: 'Cancel: status CANCELLED, never a hard delete (idempotent). A WORN outfit cannot be cancelled: invalidate its wear record first',
  request: { headers: csrf, params: id }, responses: { 204: { description: 'Cancelled' }, ...authed, 404: NOT_FOUND, 409: problem('OUTFIT_NOT_EDITABLE (worn) or VERSION_CONFLICT') },
});
route({
  method: 'post', path: '/api/v1/outfits/{id}/items', tags: out, security: session,
  summary: 'Add a garment with its role (own, not trashed; any availability status is only a warning)',
  request: { headers: ifMatch, params: id, body: body(s.itemInput) },
  responses: { 201: json('Updated outfit (new ETag)', s.outfitView, true), 400: BAD, ...authed, 404: NOT_FOUND, 409: problem('GARMENT_ALREADY_IN_OUTFIT, VERSION_CONFLICT or OUTFIT_NOT_EDITABLE'), 428: MATCH },
});
route({
  method: 'put', path: '/api/v1/outfits/{id}/items/{garmentId}', tags: out, security: session,
  summary: 'Replace one garment by another at the same position (role kept unless given)',
  request: { headers: ifMatch, params: item, body: body(s.itemReplaceBody) },
  responses: { 200: json('Updated outfit (new ETag)', s.outfitView, true), 400: BAD, ...authed, 404: NOT_FOUND, 409: problem('GARMENT_ALREADY_IN_OUTFIT, VERSION_CONFLICT or OUTFIT_NOT_EDITABLE'), 428: MATCH },
});
route({
  method: 'delete', path: '/api/v1/outfits/{id}/items/{garmentId}', tags: out, security: session, summary: 'Remove one garment',
  request: { headers: ifMatch, params: item },
  responses: { 200: json('Updated outfit (new ETag)', s.outfitView, true), ...authed, 404: NOT_FOUND, 409: problem('VERSION_CONFLICT or OUTFIT_NOT_EDITABLE'), 428: MATCH },
});
route({
  method: 'get', path: '/api/v1/outfits/{id}/conflicts', tags: out, security: session,
  summary: 'Advisory conflicts, never blocking: OVERLAP_CERTAIN (same garment in another DRAFT/PLANNED outfit whose slot provably overlaps: both ends known and intersecting, or one start inside the other known interval, or equal starts), OVERLAP_POSSIBLE (soft hint: an end is missing and both start the same local day), GARMENT_UNAVAILABLE (status not AVAILABLE) and GARMENT_TRASHED, each with up to 3 AVAILABLE same-category replacement ids in `suggestions`',
  request: { params: id }, responses: { 200: json('Conflicts', s.conflictsResponse), ...authed, 404: NOT_FOUND },
});
route({
  method: 'post', path: '/api/v1/outfits/{id}/confirm-worn', tags: out, security: session,
  summary: 'Confirm the outfit was really worn. ONE transaction: outfit -> WORN + WearRecord + immutable snapshot of every garment. It never changes any garment status (washing is a separate, optional step). Needs Idempotency-Key and expectedVersion; the same key replays the stored result',
  request: { headers: idempotency, params: id, body: body(s.confirmBody) },
  responses: {
    201: json('Confirmed', s.confirmResponse), ...IDEM, ...authed, 404: NOT_FOUND,
    409: problem('ALREADY_WORN (second confirmation with another key), VERSION_CONFLICT, OUTFIT_NOT_EDITABLE (cancelled) or IDEMPOTENCY_IN_PROGRESS'),
  },
});
route({
  method: 'post', path: '/api/v1/outfits/{id}/save-as-template', tags: out, security: session, summary: 'Copy the composition into a new template (the outfit is untouched)',
  request: { headers: idempotency, params: id, body: body(s.saveAsTemplateBody) }, responses: { 201: json('Template', s.templateView, true), ...IDEM, ...authed, 404: NOT_FOUND },
});

route({ method: 'post', path: '/api/v1/outfit-templates', tags: tpl, security: session, summary: 'Create a template (independent of any date)', request: { headers: idempotency, body: body(s.templateCreateBody) }, responses: { 201: json('Created', s.templateView, true), ...IDEM, ...authed, 404: problem('NOT_FOUND (a garment is unknown, trashed or not yours)') } });
route({ method: 'get', path: '/api/v1/outfit-templates', tags: tpl, security: session, summary: 'Own templates, newest first (cursor pagination)', request: { query: page }, responses: { 200: json('Templates', s.templatesPage), 400: BAD, ...authed } });
route({ method: 'get', path: '/api/v1/outfit-templates/{id}', tags: tpl, security: session, summary: 'One template', request: { params: id }, responses: { 200: json('Template', s.templateView, true), ...authed, 404: NOT_FOUND } });
route({
  method: 'patch', path: '/api/v1/outfit-templates/{id}', tags: tpl, security: session, summary: 'Update name, occasion or items (full replacement) guarded by If-Match',
  request: { headers: ifMatch, params: id, body: body(s.templatePatchBody) }, responses: { 200: json('Updated', s.templateView, true), 400: BAD, ...authed, 404: NOT_FOUND, 409: STALE, 428: MATCH },
});
route({ method: 'delete', path: '/api/v1/outfit-templates/{id}', tags: tpl, security: session, summary: 'Delete the template only (outfits made from it are untouched)', request: { headers: csrf, params: id }, responses: { 204: { description: 'Deleted' }, ...authed, 404: NOT_FOUND } });
route({
  method: 'post', path: '/api/v1/outfit-templates/{id}/instantiate', tags: tpl, security: session,
  summary: 'New outfit from the template (title = template name unless given; status PLANNED unless DRAFT is asked, so startsAt + timezone + occasion must exist). The template is not modified. Trashed garments come along with a warning',
  request: { headers: idempotency, params: id, body: body(s.instantiateBody) }, responses: { 201: json('Outfit', s.outfitView, true), ...IDEM, ...authed, 404: NOT_FOUND },
});

route({ method: 'get', path: '/api/v1/wear-records/{id}', tags: wear, security: session, summary: 'One wear record with its immutable garment snapshots (no photo)', request: { params: id }, responses: { 200: json('Wear record', s.wearRecordView, true), ...authed, 404: NOT_FOUND } });
route({
  method: 'post', path: '/api/v1/wear-records/{id}/mark-to-wash', tags: wear, security: session,
  summary: 'OPTIONAL washing step, a SEPARATE transaction from the confirmation (it never rolls it back). Moves the listed garments of THIS record from AVAILABLE to TO_WASH (status event source WEAR_RECORD). Per-id results: `marked`, `skipped` (not AVAILABLE: left as they are) and `failed`. Empty garmentIds = no-op 200. Needs Idempotency-Key; expectedVersions optional per garment',
  request: { headers: idempotency, params: id, body: body(s.washBody) },
  responses: { 200: json('Per-garment outcome', s.washResponse), ...IDEM, ...authed, 404: NOT_FOUND, 409: problem('WEAR_RECORD_INVALIDATED or IDEMPOTENCY_IN_PROGRESS') },
});
route({
  method: 'post', path: '/api/v1/wear-records/{id}/invalidate', tags: wear, security: session,
  summary: 'Audited correction ("I did not wear it"): reason required, status INVALIDATED (kept, with invalidatedAt and reason, snapshots unchanged), excluded from histories; the outfit goes back to PLANNED (or DRAFT) and can be confirmed again',
  request: { headers: ifMatch, params: id, body: body(s.invalidateBody) },
  responses: { 200: json('Invalidated', s.wearRecordView, true), 400: BAD, ...authed, 404: NOT_FOUND, 409: problem('ALREADY_INVALIDATED or VERSION_CONFLICT'), 428: MATCH },
});
route({
  method: 'get', path: '/api/v1/garments/{id}/wear-history', tags: wear, security: session,
  summary: 'The last (default 3, max 10) distinct local dates this garment was worn, newest first, from ACTIVE snapshots',
  request: { params: id, query: z.object({ limit: z.number().int().min(1).max(10).optional() }) }, responses: { 200: json('Dates', s.garmentHistoryResponse), 400: BAD, ...authed, 404: NOT_FOUND },
});
