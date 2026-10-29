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
  summary: 'Move to the trash (soft delete: deletedAt, purgeAfter = +30 days). Photos and links are kept until the purge. 200 with `warnings` when active outfits use it (none until phase 05), else 204',
  request: { headers: csrf, params: id }, responses: { 200: json('Trashed, with advisory warnings', s.warningsResponse), 204: { description: 'Trashed' }, ...authed, 404: NOT_FOUND },
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

const photoId = z.object({ id: z.uuid(), photoId: z.uuid() });
const pht = ['wardrobe'];

route({
  method: 'get', path: '/api/v1/garments/{id}/photos', tags: pht, security: session, summary: 'Photo metadata, in position order (never storage keys)',
  request: { params: id }, responses: { 200: json('Photos', s.photosResponse), ...authed, 404: NOT_FOUND },
});
route({
  method: 'post', path: '/api/v1/garments/{id}/photos', tags: pht, security: session,
  summary: 'Upload a photo (multipart/form-data, field `file`; optional `rotate`, `crop`). The type is detected from the bytes; the first photo is primary. The original is kept privately; the original is re-encoded without any metadata (EXIF/GPS), and optimized (max 1600 px) and thumbnail (max 400 px) WebP derivatives are stored without EXIF/GPS. Upload and cutout share a 20/min/user budget (429). Not idempotent: a retry may add another photo. Photos are never sent to any AI',
  request: { headers: csrf, params: id, body: { content: { 'multipart/form-data': { schema: s.photoUploadBody } } } },
  responses: {
    201: json('Created', s.photoView), 400: BAD, ...authed, 404: NOT_FOUND,
    409: problem('PHOTO_LIMIT_REACHED (5 photos per garment) or QUOTA_EXCEEDED (per-user stored bytes)'), 429: problem('RATE_LIMITED'),
    413: problem('PAYLOAD_TOO_LARGE (over 10 MiB; the body is cut off while streaming)'),
    415: problem('UNSUPPORTED_IMAGE_FORMAT (not JPEG/PNG/WebP; HEIC refused) or MIME_MISMATCH (declared type differs from the bytes) or UNSUPPORTED_MEDIA_TYPE'),
    422: problem('INVALID_IMAGE (corrupt, or above 50 megapixels)'),
  },
});
route({
  method: 'put', path: '/api/v1/garments/{id}/photos/{photoId}/primary', tags: pht, security: session, summary: 'Make this the primary photo (atomic; idempotent)',
  request: { headers: csrf, params: photoId }, responses: { 200: json('Photo', s.photoView), ...authed, 404: NOT_FOUND },
});
route({
  method: 'delete', path: '/api/v1/garments/{id}/photos/{photoId}', tags: pht, security: session,
  summary: 'Delete a photo (row first, then storage objects no other photo references). Deleting the primary promotes the next photo',
  request: { headers: csrf, params: photoId }, responses: { 204: { description: 'Deleted' }, ...authed, 404: NOT_FOUND },
});
route({
  method: 'post', path: '/api/v1/garments/{id}/photos/{photoId}/cutout', tags: pht, security: session,
  summary: 'Opt-in LOCAL background removal (no data leaves the server, no consent needed). On failure the photo is kept and cutoutStatus is FAILED',
  request: { headers: csrf, params: photoId }, responses: { 200: json('Photo with cutoutStatus READY or FAILED', s.photoView), ...authed, 404: NOT_FOUND },
});
route({
  method: 'get', path: '/api/v1/garments/{id}/photos/{photoId}/file', tags: pht, security: session,
  summary: 'Streams one variant (thumb | optimized (default) | original | cutout) to the owner only: Cache-Control no-store, nosniff, inline. No public or durable URL exists',
  request: { params: photoId, query: s.photoFileQuery },
  responses: {
    200: { description: 'Image bytes (WebP for thumb/optimized, original MIME for original, PNG for cutout)', content: { 'image/*': { schema: z.string() } } },
    400: BAD, ...authed, 404: NOT_FOUND,
  },
});

route({
  method: 'post', path: '/api/v1/garments/{id}/duplicate', tags: gar, security: session,
  summary: 'Duplicate: a NEW garment (new id, version 1, AVAILABLE, fresh dates) prefilled from the source; any field of the body overrides the copied value. No status history, no favorite (409 GARMENT_LIMIT_REACHED at the cap). `copyPhotos` shares the stored objects (they survive until every owner row is gone). Idempotent on the key',
  request: { headers: idempotency, params: id, body: body(s.garmentDuplicateBody) },
  responses: {
    201: json('Created (ETag W/"v1")', s.garmentView, true), 400: BAD, ...authed, 404: NOT_FOUND,
    409: problem('IDEMPOTENCY_IN_PROGRESS'), 422: problem('IDEMPOTENCY_KEY_REUSED'),
  },
});
route({
  method: 'post', path: '/api/v1/garments/bulk-actions', tags: gar, security: session,
  summary: 'SET_STATUS | SET_CATEGORY | DELETE on up to 100 ids, atomic (all or nothing). Only the listed ids are touched. Unknown, trashed and foreign ids are indistinguishable (404 with one error per id). `expectedVersions` makes a stale id a 409 with one error per id. SET_STATUS skips garments already in that status (unchangedIds) and writes one history event per changed garment. Idempotent on the key',
  request: { headers: idempotency, body: body(s.bulkBody) },
  responses: {
    200: json('Applied', s.bulkResponse), 400: BAD, ...authed,
    404: problem('NOT_FOUND (errors[] names each missing id; also an unknown customSubcategoryId)'),
    409: problem('VERSION_CONFLICT (errors[] names each stale id) or IDEMPOTENCY_IN_PROGRESS'),
    422: problem('IDEMPOTENCY_KEY_REUSED'),
  },
});
route({
  method: 'get', path: '/api/v1/garments/trash', tags: gar, security: session,
  summary: 'Own trashed garments, newest first (cursor), each with deletedAt and purgeAfter', request: { query: page },
  responses: { 200: json('Trash', s.trashPage), 400: BAD, ...authed },
});
route({
  method: 'post', path: '/api/v1/garments/{id}/restore', tags: gar, security: session,
  summary: 'Restore from the trash (status and photos as they were). Refused once purgeAfter has passed',
  request: { headers: csrf, params: id },
  responses: {
    200: json('Restored (new ETag)', s.garmentView, true), ...authed,
    404: problem('NOT_FOUND (not trashed, unknown, purged or another user\'s)'),
    409: problem('CUSTOM_SUBCATEGORY_MISSING'),
    410: problem('TRASH_EXPIRED (retention passed, purge pending)'),
  },
});

const grp = z.object({ id: z.uuid() });
const member = z.object({ id: z.uuid(), garmentId: z.uuid() });
for (const [path, label, max] of [['tags', 'tag', 40], ['collections', 'collection', 60], ['garment-sets', 'garment set (ordered)', 60]] as const) {
  const t = ['organization'];
  const base = `/api/v1/${path}`;
  route({
    method: 'post', path: base, tags: t, security: session, summary: `Create a ${label} (name unique per user, case insensitive, at most ${max} characters)`,
    request: { headers: csrf, body: body(s.organizerCreateBody(max)) },
    responses: { 201: json('Created', s.organizerView, true), 400: BAD, ...authed, 409: problem('NAME_ALREADY_USED') },
  });
  route({ method: 'get', path: base, tags: t, security: session, summary: `Own ${path}, newest first, with their garments (trashed ones flagged)`, request: { query: page }, responses: { 200: json('Page', s.organizerPage), 400: BAD, ...authed } });
  route({ method: 'get', path: `${base}/{id}`, tags: t, security: session, summary: `One ${label}`, request: { params: grp }, responses: { 200: json('Found', s.organizerView, true), ...authed, 404: NOT_FOUND } });
  route({
    method: 'patch', path: `${base}/{id}`, tags: t, security: session, summary: 'Rename, guarded by If-Match',
    request: { headers: ifMatch, params: grp, body: body(s.organizerCreateBody(max)) },
    responses: { 200: json('Renamed', s.organizerView, true), 400: BAD, ...authed, 404: NOT_FOUND, 409: problem('VERSION_CONFLICT or NAME_ALREADY_USED'), 428: problem('IF_MATCH_REQUIRED') },
  });
  route({ method: 'delete', path: `${base}/{id}`, tags: t, security: session, summary: 'Delete the list only (garments are untouched)', request: { headers: csrf, params: grp }, responses: { 204: { description: 'Deleted' }, ...authed, 404: NOT_FOUND } });
  route({
    method: 'post', path: `${base}/{id}/garments`, tags: t, security: session,
    summary: 'Attach up to 100 own, non-trashed garments (appended in order; already attached ones are ignored). All or nothing: any unknown, trashed or foreign id is a 404 naming it',
    request: { headers: csrf, params: grp, body: body(s.organizerAttachBody) },
    responses: { 200: json('Updated', s.organizerView, true), 400: BAD, ...authed, 404: NOT_FOUND, 409: problem('GROUP_FULL (500 garments)') },
  });
  route({
    method: 'delete', path: `${base}/{id}/garments/{garmentId}`, tags: t, security: session, summary: 'Detach one garment (no-op when absent)',
    request: { headers: csrf, params: member }, responses: { 200: json('Updated', s.organizerView, true), ...authed, 404: NOT_FOUND },
  });
}

// ---- outfits (phase 05 slice 1): composition, snapshot of a confirmed wear
const outfits = ["outfits"];
route({
  method: 'post', path: '/api/v1/outfits', tags: outfits, security: session,
  summary: 'Create a DRAFT outfit from live garments of the owner (no garment status changes)',
  request: { headers: idempotency, body: body(s.createOutfitBody) },
  responses: { 201: json('Created', s.outfitView), 400: BAD, ...authed, 404: NOT_FOUND, 409: problem('IDEMPOTENCY_IN_PROGRESS'), 422: problem('IDEMPOTENCY_KEY_REUSED') },
});
route({ method: 'get', path: '/api/v1/outfits/{id}', tags: outfits, security: session, summary: 'One outfit with its items and the wear record id once worn', request: { params: id }, responses: { 200: json('Outfit', s.outfitView), 404: NOT_FOUND, ...authed } });
route({
  method: 'post', path: '/api/v1/outfits/{id}/confirm-worn', tags: outfits, security: session,
  summary: 'Confirm the wear: outfit becomes WORN and one wear record snapshots its garments. Garment statuses are never changed',
  request: { params: id, headers: idempotency },
  responses: {
    200: json('Confirmed (replays return the same answer)', s.confirmWornView), 400: BAD, ...authed, 404: NOT_FOUND,
    409: problem('OUTFIT_ALREADY_WORN, OUTFIT_CANCELLED, GARMENT_UNAVAILABLE (a garment is in the trash) or IDEMPOTENCY_IN_PROGRESS'),
    422: problem('IDEMPOTENCY_KEY_REUSED'),
  },
});
route({ method: 'get', path: '/api/v1/garments/{id}/wears', tags: outfits, security: session, summary: 'Confirmed wears of one garment, most recent first (last 20). Snapshot rows: a purged garment keeps its history elsewhere', request: { params: id }, responses: { 200: json('Wears', s.garmentWearsPage), 400: BAD, ...authed } });
route({ method: 'get', path: '/api/v1/outfits', tags: outfits, security: session, summary: 'Outfits, optionally in a plannedFor window and by status (up to 100, earliest planned first). Drafts without a date are included', request: { query: s.outfitListQuery }, responses: { 200: json('Outfits', z.object({ items: z.array(s.outfitView) })), 400: BAD, ...authed } });
route({
  method: 'patch', path: '/api/v1/outfits/{id}', tags: outfits, security: session,
  summary: 'Plan or cancel an outfit: name, occasion, plannedFor (UTC) and status DRAFT, PLANNED or CANCELLED. Needs If-Match; refused once WORN or CANCELLED',
  request: { params: id, headers: ifMatch, body: body(s.outfitPatchBody) },
  responses: {
    200: json('Updated (ETag)', s.outfitView, true), 400: BAD, ...authed, 404: NOT_FOUND,
    409: problem('VERSION_CONFLICT, OUTFIT_LOCKED or PLANNED_NEEDS_START'), 428: problem('IF_MATCH_REQUIRED'),
  },
});
route({
  method: 'post', path: '/api/v1/wear-records/{id}/mark-to-wash', tags: outfits, security: session,
  summary: 'Optional laundry step: the listed garments of one wear become TO_WASH. Nothing is ticked by default; the wear record is never changed',
  request: { params: id, headers: idempotency, body: body(s.markToWashBody) },
  responses: { 200: json('changedIds and unchangedIds', z.object({ kind: z.literal('OK'), changedIds: z.array(z.uuid()), unchangedIds: z.array(z.uuid()) })), 400: BAD, ...authed, 404: NOT_FOUND, 409: problem('GARMENT_NOT_IN_WEAR or GARMENT_UNAVAILABLE (in the trash)') },
});
