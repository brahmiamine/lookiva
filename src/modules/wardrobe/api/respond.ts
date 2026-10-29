import { etagFor } from '@/platform/http/etag';

export const withEtag = <T extends { version: number }>(body: T, status = 200) => Response.json(body, { status, headers: { ETag: etagFor(body.version) } });
export const queryOf = (req: Request) => new URL(req.url).searchParams;
