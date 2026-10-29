import type { Clock } from '@/platform/clock/port';
import { assertIfMatch } from '@/platform/http/etag';
import { AppError } from '@/platform/http/errors';
import type { OwnerId, Page } from '@/platform/kernel';
import { MAX_GROUPS_PER_KIND, normalizeLabel } from '../domain/garment';
import type { PageArg } from './ports';

/** Tags, collections and garment sets share one shape and one store: a named, owner-scoped, ordered list of garments. */
export const ORGANIZER_KINDS = ['tags', 'collections', 'sets'] as const;
export type OrganizerKind = (typeof ORGANIZER_KINDS)[number];
export const MAX_MEMBERS = 500;

export type OrganizerView = {
  id: string;
  name: string;
  /** Trashed garments stay referenced and are flagged; purging a garment removes it from every group. */
  garments: { id: string; trashed: boolean }[];
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type AttachResult = OrganizerView | 'missing' | { missingGarmentIds: string[] } | 'full';

export interface OrganizerStore {
  findById(ownerId: OwnerId, id: string): Promise<OrganizerView | null>;
  list(ownerId: OwnerId, page: PageArg): Promise<Page<OrganizerView>>;
  count(ownerId: OwnerId): Promise<number>;
  /** null = name already used by this owner. */
  create(ownerId: OwnerId, name: string, now: Date): Promise<OrganizerView | null>;
  rename(ownerId: OwnerId, id: string, expectedVersion: number, name: string, now: Date): Promise<OrganizerView | 'conflict' | 'exists'>;
  remove(ownerId: OwnerId, id: string): Promise<boolean>;
  /** Appends the garments not yet members (idempotent). Garments must be the owner's and not trashed. */
  attach(ownerId: OwnerId, id: string, garmentIds: string[], now: Date): Promise<AttachResult>;
  /** Removes one member (no-op if absent); null = unknown group. */
  detach(ownerId: OwnerId, id: string, garmentId: string, now: Date): Promise<OrganizerView | null>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = () => new AppError('NOT_FOUND', 404, 'Not found');
const versionConflict = () => new AppError('VERSION_CONFLICT', 409, 'Resource version does not match If-Match');
const exists = () => new AppError('NAME_ALREADY_USED', 409, 'This name is already used');

export function createOrganizerService(store: OrganizerStore, clock: Clock, maxGroups = MAX_GROUPS_PER_KIND) {
  const own = async (owner: OwnerId, id: string): Promise<OrganizerView> => {
    const g = UUID_RE.test(id) ? await store.findById(owner, id) : null;
    if (!g) throw notFound();
    return g;
  };
  return {
    get: own,
    list: (owner: OwnerId, page: PageArg) => store.list(owner, page),
    async create(owner: OwnerId, name: string): Promise<OrganizerView> {
      if (!normalizeLabel(name)) throw new AppError('VALIDATION_ERROR', 400, 'Validation failed', [{ path: 'name', message: 'name is required' }]);
      if ((await store.count(owner)) >= maxGroups) throw new AppError('GROUP_LIMIT_REACHED', 409, `At most ${maxGroups} lists of this kind per user`);
      return (await store.create(owner, name, clock.now())) ?? (() => { throw exists(); })();
    },
    async rename(owner: OwnerId, id: string, ifMatch: string | null, name: string): Promise<OrganizerView> {
      const cur = await own(owner, id);
      assertIfMatch(ifMatch, cur.version);
      const r = await store.rename(owner, id, cur.version, name, clock.now());
      if (r === 'conflict') throw versionConflict();
      if (r === 'exists') throw exists();
      return r;
    },
    async remove(owner: OwnerId, id: string): Promise<void> {
      if (!UUID_RE.test(id) || !(await store.remove(owner, id))) throw notFound();
    },
    async attach(owner: OwnerId, id: string, garmentIds: string[]): Promise<OrganizerView> {
      if (!UUID_RE.test(id)) throw notFound();
      const r = await store.attach(owner, id, [...new Set(garmentIds)], clock.now());
      if (r === 'missing') throw notFound();
      if (r === 'full') throw new AppError('GROUP_FULL', 409, `A list holds at most ${MAX_MEMBERS} garments`);
      if ('missingGarmentIds' in r) {
        // Unknown, trashed and foreign ids look the same: no existence leak.
        throw new AppError('NOT_FOUND', 404, 'Some garments were not found; nothing was attached', r.missingGarmentIds.map((g) => ({ path: `garmentIds.${garmentIds.indexOf(g)}`, message: `garment ${g} not found` })));
      }
      return r;
    },
    async detach(owner: OwnerId, id: string, garmentId: string): Promise<OrganizerView> {
      const r = UUID_RE.test(id) ? await store.detach(owner, id, garmentId, clock.now()) : null;
      if (!r) throw notFound();
      return r;
    },
  };
}
export type OrganizerService = ReturnType<typeof createOrganizerService>;
