export type OwnerId = string & { readonly __brand: 'OwnerId' };

/** Only the auth wrapper should mint OwnerIds from a verified session. */
export const asOwnerId = (v: string): OwnerId => v as OwnerId;

export type Page<T> = { items: T[]; nextCursor?: string };

export interface OwnerScopedRepository<T> {
  findById(ownerId: OwnerId, id: string): Promise<T | null>;
  list(ownerId: OwnerId, page: { limit: number; cursor?: { id: string } }): Promise<Page<T>>;
}
