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
const page = z.object({ limit: z.number().int().min(1).max(100).optional(), cursor: z.string().optional() });

const authed = {
  401: problem('UNAUTHENTICATED (no, unknown, revoked or expired session)'),
  429: problem('RATE_LIMITED (Retry-After header; per user)'),
};
const NOT_FOUND = problem('NOT_FOUND (unknown, trashed or another user\'s resource)');
const BAD = problem('VALIDATION_ERROR or INVALID_JSON (or INVALID_CURSOR on lists)');

const route = (r: RouteDoc & { tags: string[] }) =>
  registerRoute({
    ...r,
    responses: {
      ...r.responses,
      ...((r.request as { body?: unknown } | undefined)?.body ? { 413: problem('PAYLOAD_TOO_LARGE (body over 16 KiB)') } : {}),
    },
  });

const cat = ['catalog'];
const gar = ['wardrobe'];
const cus = ['wardrobe'];

route({ method: 'get', path: '/api/v1/catalog/categories', tags: cat, summary: 'Categories and standard subtypes with FR/EN/AR labels (no gender-based category)', responses: { 200: json('Reference data', s.categoriesResponse) } });
route({ method: 'get', path: '/api/v1/catalog/colors', tags: cat, summary: 'Colors (16) and shades with FR/EN/AR labels', responses: { 200: json('Reference data', s.colorsResponse) } });
route({ method: 'get', path: '/api/v1/catalog/options', tags: cat, summary: 'Statuses (only AVAILABLE is recommendable), seasons, styles and weather value lists', responses: { 200: json('Reference data', s.optionsResponse) } });

route({
  method: 'post', path: '/api/v1/garments', tags: gar, security: session,
  summary: 'Create a garment (status AVAILABLE). Category, subtype (or custom subcategory of that category) and primary color are mandatory',
  request: { headers: idempotency, body: body(s.garmentCreateBody) },
  responses: {
    201: json('Created (ETag W/"v1")', s.garmentView, true), 400: BAD, ...authed,
    404: problem('NOT_FOUND (customSubcategoryId unknown or not yours)'),
    409: problem('IDEMPOTENCY_IN_PROGRESS'),
    422: problem('IDEMPOTENCY_KEY_REUSED'),
  },
});
route({
  method: 'get', path: '/api/v1/garments', tags: gar, security: session,
  summary: 'Own garments, newest first (cursor pagination). Filters: category, subtype (standard or parent of a custom one), color (primary or extra), season, style, status, q (nickname/notes, case and accent insensitive)',
  request: { query: s.garmentListQuery.extend(page.shape) },
  responses: { 200: json('Garments (trashed ones excluded)', s.garmentsPage), 400: BAD, ...authed },
});
route({
  method: 'get', path: '/api/v1/garments/{id}', tags: gar, security: session, summary: 'One garment (ETag W/"v<version>")',
  request: { params: id }, responses: { 200: json('Garment', s.garmentView, true), ...authed, 404: NOT_FOUND },
});
route({
  method: 'patch', path: '/api/v1/garments/{id}', tags: gar, security: session,
  summary: 'Partial update guarded by If-Match; lists (extraColors, seasons, styles) are replaced. Status is not patchable',
  request: { headers: ifMatch, params: id, body: body(s.garmentPatchBody) },
  responses: {
    200: json('Updated (new ETag)', s.garmentView, true), 400: BAD, ...authed, 404: NOT_FOUND,
    409: problem('VERSION_CONFLICT (stale ETag; `*` is refused too)'),
    428: problem('IF_MATCH_REQUIRED'),
  },
});
route({
  method: 'delete', path: '/api/v1/garments/{id}', tags: gar, security: session,
  summary: 'Move to the trash (soft delete: deletedAt, purgeAfter = +30 days). Trash listing and restore come later',
  request: { headers: csrf, params: id }, responses: { 204: { description: 'Trashed' }, ...authed, 404: NOT_FOUND },
});
route({
  method: 'post', path: '/api/v1/garments/{id}/status', tags: gar, security: session,
  summary: 'Set the current status (any to any, manual only) guarded by If-Match; writes a history event in the same transaction',
  request: { headers: ifMatch, params: id, body: body(s.statusBody) },
  responses: {
    200: json('Updated garment (new ETag)', s.garmentView, true), 400: BAD, ...authed, 404: NOT_FOUND,
    409: problem('VERSION_CONFLICT (stale ETag, e.g. a parallel change won) or STATUS_UNCHANGED'),
    428: problem('IF_MATCH_REQUIRED'),
  },
});
route({
  method: 'get', path: '/api/v1/garments/{id}/status-history', tags: gar, security: session,
  summary: 'Status events, newest first (cursor pagination)', request: { params: id, query: page },
  responses: { 200: json('Events', s.statusHistoryPage), 400: BAD, ...authed, 404: NOT_FOUND },
});

route({
  method: 'post', path: '/api/v1/custom-subcategories', tags: cus, security: session,
  summary: 'Create a custom subcategory attached to a standard subtype (label unique per user, case insensitive)',
  request: { headers: csrf, body: body(s.customCreateBody) },
  responses: { 201: json('Created', s.customView, true), 400: BAD, ...authed, 409: problem('CUSTOM_SUBCATEGORY_EXISTS') },
});
route({
  method: 'get', path: '/api/v1/custom-subcategories', tags: cus, security: session,
  summary: 'Own custom subcategories with garmentCount (trashed garments included)', request: { query: page },
  responses: { 200: json('Custom subcategories', s.customPage), 400: BAD, ...authed },
});
route({
  method: 'patch', path: '/api/v1/custom-subcategories/{id}', tags: cus, security: session,
  summary: 'Rename (the standard parent never changes) guarded by If-Match',
  request: { headers: ifMatch, params: id, body: body(s.customPatchBody) },
  responses: {
    200: json('Renamed (new ETag)', s.customView, true), 400: BAD, ...authed, 404: NOT_FOUND,
    409: problem('VERSION_CONFLICT or CUSTOM_SUBCATEGORY_EXISTS'), 428: problem('IF_MATCH_REQUIRED'),
  },
});
route({
  method: 'delete', path: '/api/v1/custom-subcategories/{id}', tags: cus, security: session,
  summary: 'Delete; when garments use it, reassignTo (standard subtype or another custom subcategory of the same category) is required and the move is atomic',
  request: { headers: csrf, params: id, query: s.customDeleteQuery },
  responses: {
    204: { description: 'Deleted (garments reassigned)' }, 400: problem('VALIDATION_ERROR (reassignTo unknown, same id or another category)'), ...authed, 404: NOT_FOUND,
    409: problem('CUSTOM_SUBCATEGORY_IN_USE (no reassignTo, or a garment started using it meanwhile)'),
  },
});
