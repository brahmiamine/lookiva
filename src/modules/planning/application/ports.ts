import type { OwnerId } from '@/platform/kernel';
export type Kind = 'EVENT' | 'TRIP';
export type Entry = {
    id: string;
    payload: unknown;
    version: number;
    createdAt: string;
    updatedAt: string;
};
export interface PlanningStore {
    list(owner: OwnerId, kind: Kind, limit: number, before?: string): Promise<Entry[]>;
    get(owner: OwnerId, kind: Kind, id: string): Promise<Entry | null>;
    create(owner: OwnerId, kind: Kind, payload: object, now: Date): Promise<Entry>;
    update(owner: OwnerId, kind: Kind, id: string, version: number, payload: object, now: Date): Promise<Entry | null>;
    remove(owner: OwnerId, kind: Kind, id: string, version: number): Promise<boolean>;
}
