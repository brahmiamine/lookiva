export interface PasswordHasher {
  hash(password: string): Promise<string>;
  /** `encoded === null` (unknown user) still runs a full hash so timing does not reveal the account. */
  verify(password: string, encoded: string | null): Promise<boolean>;
  needsRehash(encoded: string): boolean;
}

/** Opaque one-time/session tokens: only `hash` (SHA-256 hex) is ever stored. */
export interface TokenGenerator {
  generate(): { token: string; hash: string };
  hash(token: string): string;
}
