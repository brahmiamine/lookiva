import { AppError } from './errors';

export const etagFor = (version: number): string => `W/"v${version}"`;

/**
 * Accepts only the weak or strong form of the CURRENT version. `If-Match: *` is deliberately rejected (409):
 * "any version" would bypass the lost-update guard, so clients must echo the ETag they read.
 */
export function assertIfMatch(header: string | null, version: number): void {
  if (header === null) throw new AppError('IF_MATCH_REQUIRED', 428, 'If-Match header is required');
  if (header !== etagFor(version) && header !== `"v${version}"`) {
    throw new AppError('VERSION_CONFLICT', 409, 'Resource version does not match If-Match');
  }
}
