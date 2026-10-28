import { describe, expect, it } from 'vitest';
import { scryptHasher, sessionTokens } from '@/modules/identity/infrastructure/crypto';

describe('scryptHasher', () => {
  it('hash_has_the_documented_format_and_random_salt', async () => {
    const a = await scryptHasher.hash('correct horse battery');
    const b = await scryptHasher.hash('correct horse battery');
    expect(a).toMatch(/^scrypt\$32768\$8\$1\$[A-Za-z0-9+/]{22}==\$[A-Za-z0-9+/]{86}==$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain('correct horse');
  });

  it('verify_accepts_the_right_password_only', async () => {
    const h = await scryptHasher.hash('correct horse battery');
    expect(await scryptHasher.verify('correct horse battery', h)).toBe(true);
    expect(await scryptHasher.verify('correct horse batterY', h)).toBe(false);
  });

  it('verify_without_a_hash_still_does_the_work_and_fails', async () => {
    await scryptHasher.verify('warm-up', null); // first call computes the dummy hash
    const t = performance.now();
    expect(await scryptHasher.verify('anything at all', null)).toBe(false);
    // a real scrypt with N=2^15 takes milliseconds, not microseconds
    expect(performance.now() - t).toBeGreaterThan(5);
  });

  it('malformed_hashes_never_verify', async () => {
    for (const bad of ['', 'scrypt$1$2', 'bcrypt$x', 'scrypt$32768$8$1$$', 'scrypt$32768$8$1$AAAA$AAAA']) {
      expect(await scryptHasher.verify('whatever password', bad), bad).toBe(false);
    }
  });

  it('needs_rehash_when_parameters_differ', async () => {
    const h = await scryptHasher.hash('correct horse battery');
    expect(scryptHasher.needsRehash(h)).toBe(false);
    expect(scryptHasher.needsRehash(h.replace('$32768$', '$16384$'))).toBe(true);
    expect(scryptHasher.needsRehash('garbage')).toBe(true);
  });
});

describe('sessionTokens', () => {
  it('generates_256_bit_base64url_tokens_and_stores_only_their_sha256', () => {
    const { token, hash } = sessionTokens.generate();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(sessionTokens.hash(token)).toBe(hash);
    expect(sessionTokens.generate().token).not.toBe(token);
  });
});
