import type { Clock } from '@/platform/clock/port';
import { assertIfMatch } from '@/platform/http/etag';
import { AppError } from '@/platform/http/errors';
import type { OwnerId, Page } from '@/platform/kernel';
import { SUBTYPE_CATEGORY, categoryOfSubtype } from '../domain/catalog';
import { classificationError, normalizeLabel, purchaseError } from '../domain/garment';
import { canTransition, type GarmentStatus } from '../domain/status';
import { noUsage, type BulkOp, type CustomSubcategoryStore, type CustomSubcategoryView, type GarmentData, type GarmentFilter, type GarmentStore, type GarmentUsageChecker, type GarmentView, type PageArg, type StatusEventView, type TrashedGarmentView, type UsageWarning } from './ports';

const invalid = (path: string, message: string) => new AppError('VALIDATION_ERROR', 400, 'Validation failed', [{ path, message }]);
const notFound = (what: string) => new AppError('NOT_FOUND', 404, `${what} not found`);
const versionConflict = () => new AppError('VERSION_CONFLICT', 409, 'Resource version does not match If-Match');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type GarmentPatch = Partial<GarmentData>;
export type BulkRequest = { ids: string[]; expectedVersions: Record<string, number> } & (
  | { action: 'SET_STATUS'; params: { status: GarmentStatus; note: string | null } }
  | { action: 'SET_CATEGORY'; params: { categoryCode: string; subtypeCode: string | null; customSubcategoryId: string | null } }
  | { action: 'DELETE' }
);
export type BulkOutcome = { action: string; affected: number; changedIds: string[]; unchangedIds: string[]; warnings: UsageWarning[] };

export function createWardrobeService(deps: { garments: GarmentStore; customs: CustomSubcategoryStore; clock: Clock; usage?: GarmentUsageChecker }) {
  const { garments, customs, clock } = deps;
  const usage = deps.usage ?? noUsage;

  const ownGarment = async (owner: OwnerId, id: string): Promise<GarmentView> => {
    const g = UUID_RE.test(id) ? await garments.findById(owner, id) : null;
    if (!g) throw notFound('Garment');
    return g;
  };

  /** Server-side invariants shared by create and patch (the data is already shape-validated by Zod). */
  async function assertClassification(owner: OwnerId, d: Pick<GarmentData, 'categoryCode' | 'subtypeCode' | 'customSubcategoryId'>): Promise<void> {
    let customParent: string | null = null;
    if (d.customSubcategoryId !== null) {
      const c = await customs.findById(owner, d.customSubcategoryId);
      if (!c) throw notFound('Custom subcategory');
      customParent = c.parentSubtypeCode;
    }
    const err = classificationError({ categoryCode: d.categoryCode, subtypeCode: d.subtypeCode, customParent });
    if (err) throw invalid(err.startsWith('CUSTOM') ? 'customSubcategoryId' : 'subtypeCode', err);
  }
  async function assertValid(owner: OwnerId, d: GarmentData): Promise<void> {
    await assertClassification(owner, d);
    if (purchaseError(d.purchasePrice, d.purchaseCurrency)) throw invalid('purchaseCurrency', 'purchaseCurrency is required with purchasePrice');
  }

  const toData = (g: GarmentView): GarmentData => ({
    nickname: g.nickname, categoryCode: g.categoryCode, subtypeCode: g.subtypeCode, customSubcategoryId: g.customSubcategory?.id ?? null,
    primaryColor: g.primaryColor, extraColors: g.extraColors, seasons: g.seasons, styles: g.styles,
    purchasePrice: g.purchasePrice, purchaseCurrency: g.purchaseCurrency, purchasedOn: g.purchasedOn, purchaseStore: g.purchaseStore, notes: g.notes,
    warmth: g.warmth, rain: g.rain, windproof: g.windproof, breathability: g.breathability, layering: g.layering,
  });

  return {
    async createGarment(owner: OwnerId, data: GarmentData): Promise<GarmentView> {
      await assertValid(owner, data);
      return garments.create(owner, data, clock.now());
    },

    getGarment: ownGarment,

    listGarments: (owner: OwnerId, page: PageArg, filter: GarmentFilter): Promise<Page<GarmentView>> => garments.list(owner, { ...page, filter }),

    async updateGarment(owner: OwnerId, id: string, ifMatch: string | null, patch: GarmentPatch): Promise<GarmentView> {
      const cur = await ownGarment(owner, id);
      assertIfMatch(ifMatch, cur.version);
      const merged = { ...toData(cur), ...patch };
      await assertValid(owner, merged);
      const next = await garments.update(owner, id, cur.version, merged, clock.now());
      if (!next) throw versionConflict();
      return next;
    },

    /** Moves to the trash; the warnings (active outfits, phase 05) are advisory. */
    async deleteGarment(owner: OwnerId, id: string): Promise<{ warnings: UsageWarning[] }> {
      if (!UUID_RE.test(id) || !(await garments.softDelete(owner, id, clock.now()))) throw notFound('Garment');
      return { warnings: await usage.check(owner, [id]) };
    },

    /** New garment (id, version 1, AVAILABLE, no history/favorite) prefilled from the source; `overrides` win. */
    async duplicateGarment(owner: OwnerId, id: string, overrides: GarmentPatch, copy: ((newId: string) => Promise<unknown>) | null): Promise<GarmentView> {
      const base = toData(await ownGarment(owner, id));
      // Choosing one classification side in the overrides drops the other side inherited from the source.
      if (overrides.subtypeCode != null && overrides.customSubcategoryId === undefined) base.customSubcategoryId = null;
      if (overrides.customSubcategoryId != null && overrides.subtypeCode === undefined) base.subtypeCode = null;
      const data = { ...base, ...overrides };
      await assertValid(owner, data);
      const created = await garments.create(owner, data, clock.now());
      if (copy) {
        try {
          await copy(created.id);
        } catch (err) {
          await garments.hardDelete(owner, created.id); // no half duplicate: the caller may retry cleanly
          throw err;
        }
      }
      return created;
    },

    listTrash: (owner: OwnerId, page: PageArg): Promise<Page<TrashedGarmentView>> => garments.listTrash(owner, page),

    async restoreGarment(owner: OwnerId, id: string): Promise<GarmentView> {
      const r = UUID_RE.test(id) ? await garments.restore(owner, id, clock.now()) : 'missing';
      if (r === 'missing') throw notFound('Garment');
      if (r === 'expired') throw new AppError('TRASH_EXPIRED', 410, 'The 30-day retention has passed: this garment can no longer be restored');
      if (r === 'custom_missing') throw new AppError('CUSTOM_SUBCATEGORY_MISSING', 409, 'Its custom subcategory no longer exists: it cannot be restored as is');
      return r;
    },

    /** Atomic: either every id is updated or nothing is. Foreign ids are reported exactly like unknown ones. */
    async bulk(owner: OwnerId, req: BulkRequest): Promise<BulkOutcome> {
      for (const id of Object.keys(req.expectedVersions)) {
        if (!req.ids.includes(id)) throw invalid(`expectedVersions.${id}`, 'expectedVersions may only name ids of the request');
      }
      let op: BulkOp;
      if (req.action === 'SET_STATUS') op = { action: 'SET_STATUS', status: req.params.status, note: req.params.note };
      else if (req.action === 'SET_CATEGORY') {
        await assertClassification(owner, req.params);
        op = { action: 'SET_CATEGORY', ...req.params };
      } else op = { action: 'DELETE' };
      const r = await garments.bulk(owner, req.ids, op, req.expectedVersions, clock.now());
      if (!r.ok) {
        const missing = r.failures.filter((f) => f.code === 'NOT_FOUND');
        if (missing.length) {
          throw new AppError('NOT_FOUND', 404, 'Some garments were not found; nothing was changed', missing.map((f) => ({ path: `ids.${req.ids.indexOf(f.id)}`, message: `garment ${f.id} not found` })));
        }
        throw new AppError('VERSION_CONFLICT', 409, 'Some garments changed since you read them; nothing was changed', r.failures.map((f) => ({ path: `expectedVersions.${f.id}`, message: `current version is ${f.currentVersion}` })));
      }
      const warnings = op.action === 'DELETE' ? await usage.check(owner, r.changed) : [];
      return { action: req.action, affected: r.changed.length, changedIds: r.changed, unchangedIds: r.unchanged, warnings };
    },

    async changeStatus(owner: OwnerId, id: string, ifMatch: string | null, to: GarmentStatus, note: string | null): Promise<GarmentView> {
      const cur = await ownGarment(owner, id);
      assertIfMatch(ifMatch, cur.version);
      if (!canTransition(cur.status, to)) throw new AppError('STATUS_UNCHANGED', 409, `Garment is already ${to}`);
      const next = await garments.changeStatus(owner, id, cur.version, to, note, clock.now());
      if (!next) throw versionConflict();
      return next;
    },

    async statusHistory(owner: OwnerId, id: string, page: PageArg): Promise<Page<StatusEventView>> {
      await ownGarment(owner, id);
      return garments.listStatusEvents(owner, id, page);
    },

    async createCustom(owner: OwnerId, c: { label: string; parentSubtypeCode: string }): Promise<CustomSubcategoryView> {
      if (!normalizeLabel(c.label)) throw invalid('label', 'label is required');
      const r = await customs.create(owner, c, clock.now());
      if (!r) throw new AppError('CUSTOM_SUBCATEGORY_EXISTS', 409, 'A custom subcategory with this label already exists');
      return r;
    },

    listCustoms: (owner: OwnerId, page: PageArg) => customs.list(owner, page),

    async renameCustom(owner: OwnerId, id: string, ifMatch: string | null, label: string): Promise<CustomSubcategoryView> {
      const cur = UUID_RE.test(id) ? await customs.findById(owner, id) : null;
      if (!cur) throw notFound('Custom subcategory');
      assertIfMatch(ifMatch, cur.version);
      const r = await customs.rename(owner, id, cur.version, label, clock.now());
      if (r === 'conflict') throw versionConflict();
      if (r === 'exists') throw new AppError('CUSTOM_SUBCATEGORY_EXISTS', 409, 'A custom subcategory with this label already exists');
      return r;
    },

    /** `reassignTo`: a standard subtype code or the id of another custom subcategory of the same owner and category. */
    async deleteCustom(owner: OwnerId, id: string, reassignTo: string | null): Promise<void> {
      const cur = UUID_RE.test(id) ? await customs.findById(owner, id) : null;
      if (!cur) throw notFound('Custom subcategory');
      if (cur.garmentCount > 0 && reassignTo === null) {
        throw new AppError('CUSTOM_SUBCATEGORY_IN_USE', 409, `${cur.garmentCount} garment(s) use this custom subcategory: pass reassignTo`);
      }
      let target: { subtypeCode: string } | { customSubcategoryId: string } | null = null;
      if (reassignTo !== null) {
        if (SUBTYPE_CATEGORY.has(reassignTo)) {
          if (categoryOfSubtype(reassignTo) !== cur.categoryCode) throw invalid('reassignTo', 'reassignTo must belong to the same category');
          target = { subtypeCode: reassignTo };
        } else {
          const t = UUID_RE.test(reassignTo) && reassignTo !== id ? await customs.findById(owner, reassignTo) : null;
          if (!t) throw invalid('reassignTo', 'reassignTo must be a standard subtype or another of your custom subcategories');
          if (t.categoryCode !== cur.categoryCode) throw invalid('reassignTo', 'reassignTo must belong to the same category');
          target = { customSubcategoryId: t.id };
        }
      }
      const r = await customs.remove(owner, id, target, clock.now());
      if (r === 'missing') throw notFound('Custom subcategory');
      if (r === 'in_use') throw new AppError('CUSTOM_SUBCATEGORY_IN_USE', 409, 'Garments still use this custom subcategory: retry with reassignTo');
    },
  };
}
export type WardrobeService = ReturnType<typeof createWardrobeService>;
