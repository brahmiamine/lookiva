import type { Clock } from '@/platform/clock/port';
import { readJson } from '@/platform/http/body';
import type { RateLimiter } from '@/platform/rate-limit';
import type { SearchReader } from '../application/search-service';
import { createSearchService } from '../application/search-service';
import { parseIntent, SEARCH_DICTIONARY_VERSION } from '../domain/search';
import type { WithSession } from './http';
import * as s from './search-schemas';

export function createSearchHttp(reader: SearchReader, withSession: WithSession, limiter: RateLimiter, clock: Clock) {
  const service = createSearchService(reader);
  const wrap = (handler: Parameters<WithSession>[0]) => withSession(async (req, ctx) => {
    await limiter.consume({ name: 'search:user', max: 30, windowMs: 60_000 }, `user:${ctx.userId}`, clock.now());
    return handler(req, ctx);
  });
  return {
    garments: wrap(async (req, ctx) => {
      const p = req.method === 'POST' ? await readJson(req, s.searchQuery) : s.searchQuery.parse(Object.fromEntries(new URL(req.url).searchParams));
      const { category, subtype, color, season, style, status, ...rest } = p;
      const filters = Object.fromEntries(Object.entries({ category, subtype, color, season, style, status }).filter(([, v]) => v !== undefined));
      return Response.json(await service.search(ctx.userId, { ...rest, filters }));
    }),
    suggestions: wrap(async (req) => {
      const { q } = s.suggestionsQuery.parse(Object.fromEntries(new URL(req.url).searchParams));
      return Response.json({ dictionaryVersion: SEARCH_DICTIONARY_VERSION, interpretation: parseIntent(q) });
    }),
    draft: wrap(async (req, ctx) => Response.json(await service.draft(ctx.userId, (await readJson(req, s.draftBody)).garmentIds))),
  };
}
