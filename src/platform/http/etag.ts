import { AppError } from './errors';

export const etagFor = (version: number): string => `W/"v${version}"`;

export function assertIfMatch(header: string | null, version: number): void {
  if (header === null) throw new AppError('IF_MATCH_REQUIRED', 428, 'If-Match header is required');
  if (header !== etagFor(version) && header !== `"v${version}"`) {
    throw new AppError('VERSION_CONFLICT', 409, 'Resource version does not match If-Match');
  }
}
