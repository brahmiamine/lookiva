import { createHash } from 'node:crypto';
import type { OwnerId } from '@/platform/kernel';
import { AppError } from '@/platform/http/errors';
import { parseIntent, rankGarments, SEARCH_DICTIONARY_VERSION, type SearchGarment, type SearchOptions } from '../domain/search';

export type SearchInput = SearchOptions & { tag?: string; collection?: string; set?: string; limit?: number; cursor?: string };
export interface SearchReader {
  /** Reads current, non-trashed, own sources only. Implementations must also scope organizer joins. */
  list(ownerId: OwnerId, input: SearchInput): Promise<SearchGarment[]>;
}
const invalidCursor = () => new AppError('INVALID_CURSOR', 400, 'Search changed or cursor is invalid; restart from the first page');

export function createSearchService(reader: SearchReader) {
  return {
    async search(ownerId: OwnerId, input: SearchInput) {
      const limit = input.limit ?? 20;
      const { cursor, ...query } = input;
      const scope = createHash('sha256').update(JSON.stringify([ownerId, SEARCH_DICTIONARY_VERSION, query])).digest('hex');
      let after: string | undefined;
      if (cursor) {
        try {
          const c = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
          if (c.scope !== scope || typeof c.id !== 'string' || c.id.length > 64) throw invalidCursor();
          after = c.id;
        } catch { throw invalidCursor(); }
      }
      const ranked = rankGarments(await reader.list(ownerId, input), input);
      const start = after === undefined ? 0 : ranked.findIndex((r) => r.garment.id === after) + 1;
      if (after !== undefined && !start) throw invalidCursor();
      const page = ranked.slice(start, start + limit);
      const last = page.at(-1);
      return {
        mode: 'text' as const,
        dictionaryVersion: SEARCH_DICTIONARY_VERSION,
        interpretation: parseIntent(input.q ?? ''),
        items: page.map(({ garment, score, reasons }) => ({
          id: garment.id, nickname: garment.nickname, categoryCode: garment.categoryCode, subtypeCode: garment.subtypeCode,
          customLabel: garment.customLabel, primaryColorCode: garment.primaryColorCode, status: garment.status, score, reasons,
        })),
        ...(last && start + limit < ranked.length ? { nextCursor: Buffer.from(JSON.stringify({ scope, id: last.garment.id })).toString('base64url') } : {}),
      };
    },
    async draft(ownerId: OwnerId, ids: string[]) {
      const rows = await reader.list(ownerId, {});
      const own = new Map(rows.map((g) => [g.id, g]));
      if (ids.some((id) => !own.has(id))) throw new AppError('NOT_FOUND', 404, 'Garment not found');
      return { garmentIds: ids, unavailableIds: ids.filter((id) => own.get(id)?.status !== 'AVAILABLE'), saved: false as const };
    },
  };
}
