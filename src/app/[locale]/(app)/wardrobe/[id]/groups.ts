import { wardrobeRoutes } from '@/modules/wardrobe';
import type { Locale } from '@/i18n/config';
import type { GroupSet, Organizer } from '@/ui/wardrobe';
import { getJson } from '../../server-api';

/** Tags, collections and garment sets with this garment's membership, for the garment page. */
export async function loadGroups(locale: Locale, garmentId: string): Promise<GroupSet[]> {
  const [tags, collections, sets] = await Promise.all([
    getJson<{ items: Organizer[] }>((req) => wardrobeRoutes.tags.list(req), '/tags?limit=100', locale),
    getJson<{ items: Organizer[] }>((req) => wardrobeRoutes.collections.list(req), '/collections?limit=100', locale),
    getJson<{ items: Organizer[] }>((req) => wardrobeRoutes.garmentSets.list(req), '/garment-sets?limit=100', locale),
  ]);
  const toSet = (kind: GroupSet['kind'], items: Organizer[]): GroupSet => ({
    kind,
    items: items.map((g) => ({ id: g.id, name: g.name, member: g.garments.some((x) => x.id === garmentId) })),
  });
  return [toSet('tags', tags.items), toSet('collections', collections.items), toSet('garment-sets', sets.items)];
}
