import { z } from 'zod';
import { stagesValid } from '../domain/planning';
const title = z.string().trim().min(1).max(120);
const timezone = z.string().max(64).refine(v => { try {
    new Intl.DateTimeFormat('en', { timeZone: v });
    return true;
}
catch {
    return false;
} }, 'IANA timezone required');
const day = z.iso.date();
const checklist = z.array(z.strictObject({ id: z.uuid(), text: z.string().trim().min(1).max(200), done: z.boolean() })).max(100).refine(v => new Set(v.map(x => x.id)).size === v.length, 'Unique checklist IDs required');
export const eventBody = z.strictObject({
    title, date: day, timezone, type: z.enum(['PERSONAL', 'WORK', 'SPORT']), indoor: z.boolean().default(false),
    notes: z.string().trim().max(2000).default(''), checklist: checklist.default([]),
    recurrence: z.strictObject({ frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']), interval: z.number().int().min(1).max(365), until: day.optional() }).nullable().default(null),
}).refine(v => !v.recurrence?.until || v.recurrence.until >= v.date, 'Recurrence end precedes start');
export const tripBody = z.strictObject({
    title, from: day, to: day, notes: z.string().trim().max(2000).default(''),
    stages: z.array(z.strictObject({ city: title, timezone, from: day, to: day })).max(30).default([]),
    checklist: checklist.default([]), garmentIds: z.array(z.uuid()).max(100).refine(v => new Set(v).size === v.length, 'Unique garment IDs required').default([]),
    maxPieces: z.number().int().min(1).max(100).optional(),
}).refine(v => { try {
    return stagesValid(v.from, v.to, v.stages);
}
catch {
    return false;
} }, 'Stages must be inside the trip and not overlap');
export const windowQuery = z.strictObject({ from: day, to: day });
export type EventData = z.infer<typeof eventBody>;
export type TripData = z.infer<typeof tripBody>;
