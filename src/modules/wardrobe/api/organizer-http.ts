import { readJson } from '@/platform/http/body';
import { parsePage } from '@/platform/http/pagination';
import type { WithSession } from './http';
import { createOrganizerService } from '../application/organizer';
import type { OrganizerStore } from '../application/organizer';
import type { Clock } from '@/platform/clock/port';
import * as s from './schemas';
import { queryOf, withEtag } from './respond';

type Wrap = (handler: Parameters<WithSession>[0]) => ReturnType<WithSession>;

/** Handlers of one list kind (tags, collections or garment sets). */
export function createOrganizerHttp(store: OrganizerStore, clock: Clock, w: { read: Wrap; write: Wrap }, max: number, maxGroups?: number) {
  const svc = createOrganizerService(store, clock, maxGroups);
  const create = s.organizerCreateBody(max);
  return {
    create: w.write(async (req, ctx) => withEtag(await svc.create(ctx.userId, (await readJson(req, create)).name), 201)),
    list: w.read(async (req, ctx) => Response.json(await svc.list(ctx.userId, parsePage(queryOf(req))))),
    get: (req: Request, id: string) => w.read(async (_r, ctx) => withEtag(await svc.get(ctx.userId, id)))(req),
    rename: (req: Request, id: string) =>
      w.write(async (r, ctx) => withEtag(await svc.rename(ctx.userId, id, r.headers.get('if-match'), (await readJson(r, create)).name)))(req),
    remove: (req: Request, id: string) =>
      w.write(async (_r, ctx) => {
        await svc.remove(ctx.userId, id);
        return new Response(null, { status: 204 });
      })(req),
    attach: (req: Request, id: string) =>
      w.write(async (r, ctx) => withEtag(await svc.attach(ctx.userId, id, (await readJson(r, s.organizerAttachBody)).garmentIds)))(req),
    detach: (req: Request, id: string, garmentId: string) => w.write(async (_r, ctx) => withEtag(await svc.detach(ctx.userId, id, garmentId)))(req),
  };
}
export type OrganizerHttp = ReturnType<typeof createOrganizerHttp>;
