import { asOwnerId, type OwnerScopedRepository } from '@/platform/http/owner-scope';

declare const repo: OwnerScopedRepository<{ id: string }>;

// @ts-expect-error missing ownerId (string would be taken as ownerId, id missing)
void repo.findById('abc');
// @ts-expect-error plain string is not an OwnerId
void repo.findById('u1', 'abc');
// @ts-expect-error list requires ownerId
void repo.list({ limit: 10 });
// @ts-expect-error list: plain string is not an OwnerId
void repo.list('u1', { limit: 10 });

// positive cases compile
void repo.findById(asOwnerId('u1'), 'abc');
void repo.list(asOwnerId('u1'), { limit: 10 });
