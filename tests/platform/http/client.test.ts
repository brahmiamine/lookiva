import { describe, expect, it } from 'vitest';
import { clientIp, requestOrigin, UNTRUSTED_CLIENT } from '@/platform/http/client';

const req = (headers: Record<string, string>, url = 'http://localhost:3000/api/v1/x') => new Request(url, { headers });

describe('clientIp', () => {
  it('spoofed_x_forwarded_for_is_ignored_when_trust_proxy_is_false', () => {
    const a = clientIp(req({ 'x-forwarded-for': '1.1.1.1' }), false);
    const b = clientIp(req({ 'x-forwarded-for': '2.2.2.2, 3.3.3.3' }), false);
    const c = clientIp(req({}), false);
    expect([a, b, c]).toEqual([UNTRUSTED_CLIENT, UNTRUSTED_CLIENT, UNTRUSTED_CLIENT]);
  });

  it('right_most_hop_is_used_when_trust_proxy_is_true', () => {
    // The client can prepend anything; only the entry appended by our proxy (right-most) is trusted.
    expect(clientIp(req({ 'x-forwarded-for': '6.6.6.6, 10.0.0.7' }), true)).toBe('10.0.0.7');
    expect(clientIp(req({ 'x-forwarded-for': ' 10.0.0.8 ' }), true)).toBe('10.0.0.8');
  });

  it('ipv6_clients_are_grouped_by_their_64_prefix', () => {
    const ip = (xff: string) => clientIp(req({ 'x-forwarded-for': xff }), true);
    expect(ip('2001:db8:1:2:3:4:5:6')).toBe('2001:db8:1:2::/64');
    expect(ip('2001:0DB8:0001:0002:ffff::1')).toBe('2001:db8:1:2::/64');
    expect(ip('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(ip('::1')).toBe('0:0:0:0::/64');
    expect(ip('::ffff:192.0.2.7')).toBe('192.0.2.7');
    expect(ip('192.0.2.7')).toBe('192.0.2.7');
  });

  it('missing_or_empty_header_falls_back_even_when_trusted', () => {
    expect(clientIp(req({}), true)).toBe(UNTRUSTED_CLIENT);
    expect(clientIp(req({ 'x-forwarded-for': ' , ' }), true)).toBe(UNTRUSTED_CLIENT);
  });
});

describe('requestOrigin', () => {
  it('app_origin_wins_when_configured', () => {
    expect(requestOrigin(req({ host: 'evil.test' }), { trustProxy: true, appOrigin: 'https://app.example.com' })).toBe(
      'https://app.example.com',
    );
  });

  it('derives_from_host_and_url_scheme', () => {
    expect(requestOrigin(req({ host: 'localhost:3000' }), { trustProxy: false })).toBe('http://localhost:3000');
  });

  it('forwarded_proto_is_used_only_when_trust_proxy_is_true', () => {
    const r = req({ host: 'app.example.com', 'x-forwarded-proto': 'https' });
    expect(requestOrigin(r, { trustProxy: false })).toBe('http://app.example.com');
    expect(requestOrigin(r, { trustProxy: true })).toBe('https://app.example.com');
    expect(requestOrigin(req({ host: 'a.test', 'x-forwarded-proto': 'gopher' }), { trustProxy: true })).toBe('http://a.test');
  });
});
