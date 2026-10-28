import { createHash, randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import type { PasswordHasher, TokenGenerator } from '../application/ports';

const N = 2 ** 15;
const R = 8;
const P = 1;
const SALT_BYTES = 16;
const KEY_LENGTH = 64;

const derive = (password: string, salt: Buffer, o: { N: number; r: number; p: number }): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    // scrypt needs 128 * N * r bytes; Node's default maxmem (32 MiB) is exactly that for N=2^15, r=8: double it.
    const opts: ScryptOptions = { ...o, maxmem: 256 * o.N * o.r };
    scrypt(password.normalize('NFC'), salt, KEY_LENGTH, opts, (err, key) => (err ? reject(err) : resolve(key)));
  });

type Parsed = { N: number; r: number; p: number; salt: Buffer; hash: Buffer };

function parse(encoded: string): Parsed | null {
  const parts = encoded.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;
  const [n, r, p] = parts.slice(1, 4).map(Number) as [number, number, number];
  const salt = Buffer.from(parts[4] as string, 'base64');
  const hash = Buffer.from(parts[5] as string, 'base64');
  // Never above the current parameters (a tampered row must not make us allocate gigabytes), N a power of two >= 2.
  const sane =
    [n, r, p].every((v) => Number.isInteger(v) && v > 0) && n >= 2 && n <= N && (n & (n - 1)) === 0 && r <= R && p <= P;
  if (!sane || salt.length < SALT_BYTES || hash.length !== KEY_LENGTH) return null;
  return { N: n, r, p, salt, hash };
}

const encode = (salt: Buffer, hash: Buffer) => `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${hash.toString('base64')}`;

let dummy: Promise<string> | undefined;

/** scrypt N=2^15 r=8 p=1, 16-byte salt, 64-byte key, stored as `scrypt$N$r$p$saltB64$hashB64`. */
export const scryptHasher: PasswordHasher = {
  async hash(password) {
    const salt = randomBytes(SALT_BYTES);
    return encode(salt, await derive(password, salt, { N, r: R, p: P }));
  },
  async verify(password, encoded) {
    if (encoded === null) {
      dummy ??= this.hash(randomBytes(16).toString('hex'));
      await this.verify(password, await dummy);
      return false;
    }
    const parsed = parse(encoded);
    if (!parsed) return false;
    try {
      return timingSafeEqual(await derive(password, parsed.salt, parsed), parsed.hash);
    } catch {
      return false; // invalid parameters for this runtime: never a 500, never a match
    }
  },
  needsRehash(encoded) {
    const p = parse(encoded);
    return !p || p.N !== N || p.r !== R || p.p !== P;
  },
};

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** 256-bit random tokens, base64url (43 chars); SHA-256 hex is what the database sees. */
export const sessionTokens: TokenGenerator = {
  generate() {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: sha256(token) };
  },
  hash: sha256,
};
