import { wardrobeRoutes } from '@/modules/wardrobe';
import type { Locale } from '@/i18n/config';
import type { GroupKind, GroupSet, Organizer } from '@/ui/wardrobe';
import { getJson } from '../server-api';

/** The three organiser lists (tags, collections, garment sets), read in-process like the other pages. */
export async function loadOrganizers(locale: Locale): Promise<{ kind: GroupKind; items: Organizer[] }[]> {
  const [tags, collections, sets] = await Promise.all([
    getJson<{ items: Organizer[] }>((req) => wardrobeRoutes.tags.list(req), '/tags?limit=100', locale),
    getJson<{ items: Organizer[] }>((req) => wardrobeRoutes.collections.list(req), '/collections?limit=100', locale),
    getJson<{ items: Organizer[] }>((req) => wardrobeRoutes.garmentSets.list(req), '/garment-sets?limit=100', locale),
  ]);
  return [
    { kind: 'tags', items: tags.items },
    { kind: 'collections', items: collections.items },
    { kind: 'garment-sets', items: sets.items },
  ];
}

/** Groups with this garment's membership, for the garment page. */
export async function loadGroups(locale: Locale, garmentId: string): Promise<GroupSet[]> {
  const lists = await loadOrganizers(locale);
  return lists.map(({ kind, items }) => ({
    kind,
    items: items.map((g) => ({ id: g.id, name: g.name, member: g.garments.some((x) => x.id === garmentId) })),
  }));
}
