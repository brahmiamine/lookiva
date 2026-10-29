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

describe('scryptHasher tampered encodings (M4)', () => {
  it('parameters_above_the_current_ones_or_invalid_never_run_and_never_throw', async () => {
    const good = await scryptHasher.hash('correct horse battery');
    const [, , , , salt, hash] = good.split('$');
    const tampered = [
      `scrypt$${2 ** 20}$8$1$${salt}$${hash}`, // memory bomb
      `scrypt$30000$8$1$${salt}$${hash}`, // not a power of two (scrypt itself would throw)
      `scrypt$32768$9$1$${salt}$${hash}`,
      `scrypt$32768$8$2$${salt}$${hash}`,
      `scrypt$1$8$1$${salt}$${hash}`,
      `scrypt$32768$8$1$!!!$${hash}`,
      'scrypt$32768$8$1$$$',
    ];
    for (const t of tampered) {
      await expect(scryptHasher.verify('correct horse battery', t), t).resolves.toBe(false);
      expect(scryptHasher.needsRehash(t), t).toBe(true);
    }
  });

  it('lower_legacy_parameters_still_verify_and_need_a_rehash', async () => {
    const { scryptSync } = await import('node:crypto');
    const salt = Buffer.alloc(16, 7);
    const key = scryptSync('correct horse battery', salt, 64, { N: 2 ** 14, r: 8, p: 1 });
    const legacy = `scrypt$16384$8$1$${salt.toString('base64')}$${key.toString('base64')}`;
    expect(await scryptHasher.verify('correct horse battery', legacy)).toBe(true);
    expect(scryptHasher.needsRehash(legacy)).toBe(true);
  });
});
