/** Shared bucket for every client when the peer address cannot be trusted (TRUST_PROXY=false). */
export const UNTRUSTED_CLIENT = 'untrusted';

/**
 * Client address for rate limiting. Route handlers never see the socket, so the only source is X-Forwarded-For,
 * which any client can forge. It is read ONLY when TRUST_PROXY=true, i.e. behind exactly one reverse proxy that
 * appends the peer address: then the right-most entry is the one that proxy wrote (anything to its left is
 * client-controlled). Otherwise every request shares UNTRUSTED_CLIENT, so per-IP limits act as global limits.
 */
export function clientIp(req: Request, trustProxy: boolean): string {
  if (!trustProxy) return UNTRUSTED_CLIENT;
  const hops = (req.headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);
  return hops.at(-1) ?? UNTRUSTED_CLIENT;
}

/**
 * Public origin of the request: APP_ORIGIN when configured, else `Host` with the URL scheme
 * (X-Forwarded-Proto replaces the scheme only when TRUST_PROXY=true and it is http or https).
 */
export function requestOrigin(req: Request, opts: { trustProxy: boolean; appOrigin?: string }): string {
  if (opts.appOrigin) return opts.appOrigin;
  const url = new URL(req.url);
  const forwarded = opts.trustProxy ? req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() : undefined;
  const proto = forwarded === 'http' || forwarded === 'https' ? forwarded : url.protocol.slice(0, -1);
  return `${proto}://${req.headers.get('host') ?? url.host}`;
}
