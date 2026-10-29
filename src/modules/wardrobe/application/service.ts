import type { Clock } from '@/platform/clock/port';
import { assertIfMatch } from '@/platform/http/etag';
import { AppError } from '@/platform/http/errors';
import type { OwnerId, Page } from '@/platform/kernel';
import { SUBTYPE_CATEGORY, categoryOfSubtype } from '../domain/catalog';
import { classificationError, normalizeLabel, purchaseError } from '../domain/garment';
import { canTransition, type GarmentStatus } from '../domain/status';
import type { CustomSubcategoryStore, CustomSubcategoryView, GarmentData, GarmentFilter, GarmentStore, GarmentView, PageArg, StatusEventView } from './ports';

const invalid = (path: string, message: string) => new AppError('VALIDATION_ERROR', 400, 'Validation failed', [{ path, message }]);
const notFound = (what: string) => new AppError('NOT_FOUND', 404, `${what} not found`);
const versionConflict = () => new AppError('VERSION_CONFLICT', 409, 'Resource version does not match If-Match');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type GarmentPatch = Partial<GarmentData>;

export function createWardrobeService(deps: { garments: GarmentStore; customs: CustomSubcategoryStore; clock: Clock }) {
  const { garments, customs, clock } = deps;

  const ownGarment = async (owner: OwnerId, id: string): Promise<GarmentView> => {
    const g = UUID_RE.test(id) ? await garments.findById(owner, id) : null;
    if (!g) throw notFound('Garment');
    return g;
  };

  /** Server-side invariants shared by create and patch (the data is already shape-validated by Zod). */
  async function assertValid(owner: OwnerId, d: GarmentData): Promise<void> {
    let customParent: string | null = null;
    if (d.customSubcategoryId !== null) {
      const c = await customs.findById(owner, d.customSubcategoryId);
      if (!c) throw notFound('Custom subcategory');
      customParent = c.parentSubtypeCode;
    }
    const err = classificationError({ categoryCode: d.categoryCode, subtypeCode: d.subtypeCode, customParent });
    if (err) throw invalid(err.startsWith('CUSTOM') ? 'customSubcategoryId' : 'subtypeCode', err);
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

    async deleteGarment(owner: OwnerId, id: string): Promise<void> {
      if (!UUID_RE.test(id) || !(await garments.softDelete(owner, id, clock.now()))) throw notFound('Garment');
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
