import type { Clock } from '@/platform/clock/port';
import { AppError } from '@/platform/http/errors';
import { assertIfMatch } from '@/platform/http/etag';
import { newId } from '@/platform/http/ids';
import type { OwnerId, Page } from '@/platform/kernel';
import type { GarmentGateway, GarmentRef } from '@/modules/wardrobe';
import { isEditable, isTimezone, localParts, overlap, planningGaps, type OutfitStatus } from '../domain/outfit';
import { missingRoles } from '../domain/roles';
import type { GarmentWearEntry, ItemInput, OutfitData, OutfitStore, OutfitView, Schedule, Snapshot, TemplateStore, TemplateView, WearRecordView, WearStore } from './ports';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const invalid = (path: string, message: string) => new AppError('VALIDATION_ERROR', 400, 'Validation failed', [{ path, message }]);
const notFound = (what: string) => new AppError('NOT_FOUND', 404, `${what} not found`);
const versionConflict = () => new AppError('VERSION_CONFLICT', 409, 'Resource version does not match the current one');

const MAX_ITEMS = 12;
export type Warning =
  | { code: 'MISSING_ROLE'; role: string }
  | { code: 'GARMENT_UNAVAILABLE'; garmentId: string; status: string }
  | { code: 'GARMENT_TRASHED'; garmentId: string };
export type Conflict = {
  kind: 'OVERLAP_CERTAIN' | 'OVERLAP_POSSIBLE' | 'GARMENT_UNAVAILABLE' | 'GARMENT_TRASHED';
  garmentId: string;
  /** The other outfit for overlaps; the current status for unavailability. */
  otherOutfitId?: string;
  status?: string;
  /** AVAILABLE garments of the same category, offered as replacements (never applied automatically). */
  suggestions: string[];
};
export type WithWarnings<T> = T & { warnings: Warning[] };

/** Input of create / patch: the HTTP layer has already validated shapes (ISO instants, IANA zone, enums). */
export type OutfitInput = {
  title?: string | null;
  occasion?: string | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  timezone?: string | null;
  status?: 'DRAFT' | 'PLANNED';
  items?: ItemInput[];
};

export type WashResult = {
  wearRecordId: string;
  marked: string[];
  skipped: { garmentId: string; status: string; reason: 'NOT_AVAILABLE' }[];
  failed: { garmentId: string; code: 'NOT_IN_RECORD' | 'NOT_FOUND' | 'VERSION_CONFLICT' | 'STATUS_UPDATE_FAILED'; currentVersion?: number }[];
};

const toSnapshot = (g: GarmentRef): Snapshot => ({
  nickname: g.nickname, categoryCode: g.categoryCode, subtypeCode: g.subtypeCode, customSubtypeLabel: g.customSubtypeLabel,
  primaryColorCode: g.primaryColorCode, extraColorCodes: g.extraColorCodes,
});

export function createOutfitService(deps: { outfits: OutfitStore; wears: WearStore; templates: TemplateStore; garments: GarmentGateway; clock: Clock }) {
  const { outfits, wears, templates, garments, clock } = deps;

  const own = async (owner: OwnerId, id: string): Promise<OutfitView> => {
    const o = UUID_RE.test(id) ? await outfits.findById(owner, id) : null;
    if (!o) throw notFound('Outfit');
    return o;
  };
  const ownTemplate = async (owner: OwnerId, id: string): Promise<TemplateView> => {
    const t = UUID_RE.test(id) ? await templates.findById(owner, id) : null;
    if (!t) throw notFound('Outfit template');
    return t;
  };

  /** Every item must be an own, non-trashed garment (404 naming it otherwise: foreign and unknown look alike). Availability is only a warning. */
  async function assertItems(owner: OwnerId, items: ItemInput[], keep: Set<string> = new Set()): Promise<void> {
    items = items.filter((i) => !keep.has(i.garmentId)); // trashed garments already in the outfit are tolerated (warning)
    const found = new Map((await garments.find(owner, items.map((i) => i.garmentId))).map((g) => [g.id, g]));
    const bad = items.flatMap((it, i) => (found.get(it.garmentId)?.trashed === false ? [] : [{ path: `items.${i}.garmentId`, message: `garment ${it.garmentId} not found` }]));
    if (bad.length) throw new AppError('NOT_FOUND', 404, 'Some garments were not found; nothing was changed', bad);
  }

  /** Advisory only: missing roles, trashed or not AVAILABLE garments. */
  async function warningsOf(owner: OwnerId, o: OutfitView): Promise<Warning[]> {
    if (!isEditable(o.status)) return [];
    const out: Warning[] = missingRoles(o.items.map((i) => i.role)).map((role) => ({ code: 'MISSING_ROLE', role }));
    for (const g of await garments.find(owner, o.items.map((i) => i.garmentId))) {
      if (g.trashed) out.push({ code: 'GARMENT_TRASHED', garmentId: g.id });
      else if (g.status !== 'AVAILABLE') out.push({ code: 'GARMENT_UNAVAILABLE', garmentId: g.id, status: g.status });
    }
    return out;
  }
  const decorate = async (owner: OwnerId, o: OutfitView): Promise<WithWarnings<OutfitView>> => ({ ...o, warnings: await warningsOf(owner, o) });

  /** Merges the input over the current values, derives the local wall clock and enforces what PLANNED needs. */
  function resolve(base: { title: string | null; occasion: string | null; status: OutfitStatus; startsAt: Date | null; endsAt: Date | null; timezone: string | null }, input: OutfitInput): OutfitData {
    const startsAt = input.startsAt === undefined ? base.startsAt : input.startsAt;
    const endsAt = input.endsAt === undefined ? base.endsAt : input.endsAt;
    const timezone = input.timezone === undefined ? base.timezone : input.timezone;
    const data = { title: input.title === undefined ? base.title : input.title, occasion: input.occasion === undefined ? base.occasion : input.occasion, status: input.status ?? (base.status as OutfitStatus) };
    if (startsAt && !timezone) throw invalid('timezone', 'timezone (IANA) is required with startsAt');
    if (timezone && !isTimezone(timezone)) throw invalid('timezone', 'unknown IANA timezone');
    if (endsAt && !startsAt) throw invalid('endsAt', 'endsAt requires startsAt');
    if (endsAt && startsAt && endsAt <= startsAt) throw invalid('endsAt', 'endsAt must be after startsAt');
    const sched: Schedule = startsAt && timezone ? { startsAt, endsAt, timezone, ...localParts(startsAt, timezone) } : { startsAt: null, endsAt: null, timezone: null, localDate: null, localTime: null };
    const full = { ...data, ...sched };
    if (full.status === 'PLANNED') {
      const gaps = planningGaps(full);
      if (gaps.length) throw new AppError('VALIDATION_ERROR', 400, 'A planned outfit needs a start (with its timezone) and an occasion', gaps.map((path) => ({ path, message: `${path} is required to plan an outfit` })));
    }
    return full;
  }

  async function create(owner: OwnerId, input: OutfitInput): Promise<WithWarnings<OutfitView>> {
    const items = input.items ?? [];
    const data = resolve({ title: null, occasion: null, status: 'DRAFT', startsAt: null, endsAt: null, timezone: null }, input);
    await assertItems(owner, items);
    return decorate(owner, await outfits.create(owner, data, items, clock.now()));
  }

  /** Common path of patch / add / remove / replace: CAS on If-Match, only DRAFT/PLANNED. */
  async function mutate(owner: OwnerId, id: string, ifMatch: string | null, change: (cur: OutfitView) => { input: OutfitInput; items?: ItemInput[] }): Promise<WithWarnings<OutfitView>> {
    const cur = await own(owner, id);
    assertIfMatch(ifMatch, cur.version);
    if (!isEditable(cur.status)) throw new AppError('OUTFIT_NOT_EDITABLE', 409, `A ${cur.status} outfit can no longer be edited`);
    const { input, items } = change(cur);
    const data = resolve({ ...cur, startsAt: cur.startsAt ? new Date(cur.startsAt) : null, endsAt: cur.endsAt ? new Date(cur.endsAt) : null }, input);
    if (items) await assertItems(owner, items, new Set(cur.items.map((i) => i.garmentId)));
    const next = await outfits.update(owner, id, cur.version, data, items, clock.now());
    if (!next) throw versionConflict();
    return decorate(owner, next);
  }
  const asInputs = (cur: OutfitView): ItemInput[] => cur.items.map(({ garmentId, role }) => ({ garmentId, role }));
  const duplicateItem = (garmentId: string) => new AppError('GARMENT_ALREADY_IN_OUTFIT', 409, `garment ${garmentId} is already in this outfit`);

  async function conflicts(owner: OwnerId, id: string): Promise<{ outfitId: string; conflicts: Conflict[] }> {
    const o = await own(owner, id);
    if (!isEditable(o.status)) return { outfitId: id, conflicts: [] };
    const ids = o.items.map((i) => i.garmentId);
    const refs = await garments.find(owner, ids);
    const out: Conflict[] = [];
    const cache = new Map<string, Promise<string[]>>();
    const suggest = (category: string) => cache.get(category) ?? (cache.set(category, garments.availableInCategory(owner, category, ids, 3)), cache.get(category) as Promise<string[]>);
    for (const g of refs) {
      if (g.trashed) out.push({ kind: 'GARMENT_TRASHED', garmentId: g.id, suggestions: [] });
      else if (g.status !== 'AVAILABLE') {
        out.push({ kind: 'GARMENT_UNAVAILABLE', garmentId: g.id, status: g.status, suggestions: await suggest(g.categoryCode) });
      }
    }
    if (o.startsAt) {
      const me = { startsAt: new Date(o.startsAt), endsAt: o.endsAt ? new Date(o.endsAt) : null, localDate: o.localDate as string };
      const day = 86_400_000;
      for (const n of await outfits.neighbors(owner, id, ids, new Date(me.startsAt.getTime() - day), new Date(me.startsAt.getTime() + day))) {
        const kind = overlap(me, n);
        if (!kind) continue;
        for (const garmentId of n.garmentIds) {
          const g = refs.find((r) => r.id === garmentId);
          out.push({ kind: kind === 'CERTAIN' ? 'OVERLAP_CERTAIN' : 'OVERLAP_POSSIBLE', garmentId, otherOutfitId: n.outfitId, suggestions: g ? await suggest(g.categoryCode) : [] });
        }
      }
    }
    return { outfitId: id, conflicts: out };
  }

  const ownWear = async (owner: OwnerId, id: string): Promise<WearRecordView> => {
    const r = UUID_RE.test(id) ? await wears.findById(owner, id) : null;
    if (!r) throw notFound('Wear record');
    return r;
  };

  return {
    create,
    get: async (owner: OwnerId, id: string) => decorate(owner, await own(owner, id)),
    list: (owner: OwnerId, page: { limit: number; cursor?: { id: string } }, status?: OutfitStatus): Promise<Page<OutfitView>> => outfits.list(owner, { ...page, status }),
    range: async (owner: OwnerId, from: string, to: string, status?: OutfitStatus) => {
      if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > 62) throw new AppError('RANGE_TOO_LARGE', 422, 'The date range may span at most 62 days');
      const rows = await outfits.range(owner, from, to, status); // asks for 201
      return { items: rows.slice(0, 200), truncated: rows.length > 200 };
    },

    patch: (owner: OwnerId, id: string, ifMatch: string | null, input: OutfitInput) => mutate(owner, id, ifMatch, () => ({ input, items: input.items })),

    addItem: (owner: OwnerId, id: string, ifMatch: string | null, item: ItemInput) =>
      mutate(owner, id, ifMatch, (cur) => {
        if (cur.items.some((i) => i.garmentId === item.garmentId)) throw duplicateItem(item.garmentId);
        if (cur.items.length >= MAX_ITEMS) throw new AppError('OUTFIT_FULL', 409, `An outfit holds at most ${MAX_ITEMS} garments`);
        return { input: {}, items: [...asInputs(cur), item] };
      }),

    removeItem: (owner: OwnerId, id: string, ifMatch: string | null, garmentId: string) =>
      mutate(owner, id, ifMatch, (cur) => {
        if (!cur.items.some((i) => i.garmentId === garmentId)) throw notFound('Outfit item');
        return { input: {}, items: asInputs(cur).filter((i) => i.garmentId !== garmentId) };
      }),

    /** Swaps `garmentId` for another garment (same position; the role is kept unless given). */
    replaceItem: (owner: OwnerId, id: string, ifMatch: string | null, garmentId: string, to: { garmentId: string; role?: ItemInput['role'] }) =>
      mutate(owner, id, ifMatch, (cur) => {
        const at = cur.items.findIndex((i) => i.garmentId === garmentId);
        if (at < 0) throw notFound('Outfit item');
        if (to.garmentId !== garmentId && cur.items.some((i) => i.garmentId === to.garmentId)) throw duplicateItem(to.garmentId);
        const items = asInputs(cur);
        items[at] = { garmentId: to.garmentId, role: to.role ?? items[at]!.role };
        return { input: {}, items };
      }),

    /** DELETE semantic: CANCELLED, never a hard delete (a worn outfit keeps its history and cannot be cancelled). */
    async cancel(owner: OwnerId, id: string, ifMatch: string | null): Promise<void> {
      const cur = await own(owner, id);
      if (cur.status === 'CANCELLED') return;
      assertIfMatch(ifMatch, cur.version);
      if (cur.status === 'WORN') throw new AppError('OUTFIT_NOT_EDITABLE', 409, 'A worn outfit cannot be cancelled: invalidate its wear record first');
      if (!(await outfits.update(owner, id, cur.version, { status: 'CANCELLED' }, undefined, clock.now()))) throw versionConflict();
    },

    conflicts,

    /** ONE transaction: outfit -> WORN + WearRecord + snapshots. No garment status is read for a decision nor written. */
    async confirmWorn(owner: OwnerId, id: string, req: { expectedVersion: number; timezone?: string }): Promise<{ outfit: OutfitView; record: WearRecordView }> {
      const o = await own(owner, id);
      if (o.status === 'WORN') throw new AppError('ALREADY_WORN', 409, 'This outfit is already confirmed as worn');
      if (o.status === 'CANCELLED') throw new AppError('OUTFIT_NOT_EDITABLE', 409, 'A cancelled outfit cannot be worn');
      if (o.version !== req.expectedVersion) throw versionConflict();
      if (!o.items.length) throw invalid('items', 'An outfit without garments cannot be confirmed as worn');
      const tz = req.timezone ?? o.timezone ?? 'UTC';
      if (!isTimezone(tz)) throw invalid('timezone', 'unknown IANA timezone');
      const refs = new Map((await garments.find(owner, o.items.map((i) => i.garmentId))).map((g) => [g.id, g]));
      const now = clock.now();
      const items = o.items.flatMap((i) => {
        const g = refs.get(i.garmentId);
        return g ? [{ ...i, snapshot: toSnapshot(g) }] : [];
      });
      if (!items.length) throw new AppError('OUTFIT_EMPTY', 409, 'None of the garments of this outfit exists any more');
      const r = await outfits.confirm(owner, id, req.expectedVersion, { id: newId(), confirmedAt: now, ...localParts(now, tz), timezone: tz, items }, now);
      if (!r.ok) {
        if (r.code === 'ALREADY_WORN') throw new AppError('ALREADY_WORN', 409, 'This outfit is already confirmed as worn');
        if (r.code === 'NOT_CONFIRMABLE') throw new AppError('OUTFIT_NOT_EDITABLE', 409, 'This outfit can no longer be confirmed');
        throw versionConflict();
      }
      return { outfit: r.outfit, record: r.record };
    },

    getWearRecord: ownWear,

    /**
     * SEPARATE from the confirmation: never rolls it back. Each garment is its own attempt through the wardrobe's status path;
     * only AVAILABLE garments of this record move to TO_WASH, the others are reported in `skipped`. Empty list = no-op.
     */
    async markToWash(owner: OwnerId, recordId: string, req: { garmentIds: string[]; expectedVersions: Record<string, number> }): Promise<WashResult> {
      const rec = await ownWear(owner, recordId);
      if (rec.status !== 'ACTIVE') throw new AppError('WEAR_RECORD_INVALIDATED', 409, 'This wear record was invalidated');
      const inRecord = new Set(rec.items.flatMap((i) => (i.garmentId ? [i.garmentId] : [])));
      const res: WashResult = { wearRecordId: recordId, marked: [], skipped: [], failed: [] };
      for (const garmentId of req.garmentIds) {
        if (!inRecord.has(garmentId)) {
          res.failed.push({ garmentId, code: 'NOT_IN_RECORD' }); // foreign ids look exactly like ids of other records
          continue;
        }
        try {
          const r = await garments.setStatus(owner, garmentId, 'TO_WASH', { source: 'WEAR_RECORD', note: recordId, expectedVersion: req.expectedVersions[garmentId], onlyFrom: ['AVAILABLE'] });
          if (r.ok) res.marked.push(garmentId);
          else if (r.code === 'NOT_ELIGIBLE') res.skipped.push({ garmentId, status: r.status as string, reason: 'NOT_AVAILABLE' });
          else res.failed.push({ garmentId, code: r.code, ...(r.currentVersion !== undefined ? { currentVersion: r.currentVersion } : {}) });
        } catch {
          res.failed.push({ garmentId, code: 'STATUS_UPDATE_FAILED' });
        }
      }
      return res;
    },

    /** Audited correction: reason required, the snapshot stays untouched, the outfit can be confirmed again. */
    async invalidate(owner: OwnerId, id: string, ifMatch: string | null, reason: string): Promise<WearRecordView> {
      const cur = await ownWear(owner, id);
      assertIfMatch(ifMatch, cur.version);
      if (cur.status !== 'ACTIVE') throw new AppError('ALREADY_INVALIDATED', 409, 'This wear record is already invalidated');
      const next = await wears.invalidate(owner, id, cur.version, reason, clock.now());
      if (!next) throw versionConflict();
      return next;
    },

    lastWorn: (owner: OwnerId, limit: number) => wears.lastWorn(owner, limit),

    async garmentHistory(owner: OwnerId, garmentId: string, limit: number): Promise<GarmentWearEntry[]> {
      if (!UUID_RE.test(garmentId) || !(await garments.find(owner, [garmentId])).length) throw notFound('Garment');
      return wears.garmentHistory(owner, garmentId, limit);
    },

    // ---- templates (independent of any date)
    async createTemplate(owner: OwnerId, t: { name: string; occasion: string | null; items: ItemInput[] }): Promise<WithWarnings<TemplateView>> {
      await assertItems(owner, t.items);
      const v = await templates.create(owner, { name: t.name, occasion: t.occasion }, t.items, clock.now());
      return { ...v, warnings: missingRoles(v.items.map((i) => i.role)).map((role) => ({ code: 'MISSING_ROLE', role })) };
    },
    getTemplate: ownTemplate,
    listTemplates: (owner: OwnerId, page: { limit: number; cursor?: { id: string } }) => templates.list(owner, page),
    async patchTemplate(owner: OwnerId, id: string, ifMatch: string | null, p: { name?: string; occasion?: string | null; items?: ItemInput[] }): Promise<TemplateView> {
      const cur = await ownTemplate(owner, id);
      assertIfMatch(ifMatch, cur.version);
      if (p.items) await assertItems(owner, p.items);
      const next = await templates.update(owner, id, cur.version, { name: p.name, occasion: p.occasion }, p.items, clock.now());
      if (!next) throw versionConflict();
      return next;
    },
    async removeTemplate(owner: OwnerId, id: string): Promise<void> {
      if (!UUID_RE.test(id) || !(await templates.remove(owner, id))) throw notFound('Outfit template');
    },

    /** New outfit from the template (garments that are trashed come along with a warning); the template is not modified. */
    async instantiate(owner: OwnerId, id: string, input: { title?: string | null; occasion?: string | null; startsAt?: Date | null; endsAt?: Date | null; timezone?: string | null; status?: 'DRAFT' | 'PLANNED' }): Promise<WithWarnings<OutfitView>> {
      const t = await ownTemplate(owner, id);
      const items = t.items.map(({ garmentId, role }) => ({ garmentId, role }));
      const data = resolve({ title: null, occasion: t.occasion, status: 'DRAFT', startsAt: null, endsAt: null, timezone: null }, { ...input, title: input.title ?? t.name, status: input.status ?? 'PLANNED' });
      return decorate(owner, await outfits.create(owner, data, items, clock.now()));
    },

    async saveAsTemplate(owner: OwnerId, id: string, name: string): Promise<WithWarnings<TemplateView>> {
      const o = await own(owner, id);
      const items = o.items.map(({ garmentId, role }) => ({ garmentId, role }));
      const v = await templates.create(owner, { name, occasion: o.occasion }, items, clock.now());
      return { ...v, warnings: missingRoles(v.items.map((i) => i.role)).map((role) => ({ code: 'MISSING_ROLE', role })) };
    },
  };
}
export type OutfitService = ReturnType<typeof createOutfitService>;
