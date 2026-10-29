import { isIPv4, isIPv6 } from 'node:net';

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
  const last = hops.at(-1);
  return last === undefined ? UNTRUSTED_CLIENT : bucketOf(last);
}

/**
 * IPv6 clients usually own a whole /64: keying on the full address would hand them 2^64 buckets. IPv6 addresses
 * map to their /64 prefix, IPv4-mapped IPv6 to the IPv4 address; anything else is used as is.
 */
function bucketOf(addr: string): string {
  if (isIPv4(addr)) return addr;
  if (!isIPv6(addr)) return addr;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(addr);
  if (mapped?.[1]) return mapped[1];
  const [head = '', tail = ''] = addr.toLowerCase().split('::');
  const left = head ? head.split(':') : [];
  const right = addr.includes('::') ? (tail ? tail.split(':') : []) : [];
  const groups = [...left, ...Array<string>(8 - left.length - right.length).fill('0'), ...right];
  return `${groups.slice(0, 4).map((g) => parseInt(g, 16).toString(16)).join(':')}::/64`;
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
