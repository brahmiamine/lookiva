import { z } from 'zod';
import { OCCASIONS } from '../domain/engine';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v), 'must be a real YYYY-MM-DD date');
const hour = z.coerce.number().int().min(0).max(23);
const city = z.string().trim().min(1).max(120);
const hours = (b: { from?: number; to?: number }) => (b.from ?? 8) <= (b.to ?? 20);
const hoursIssue = { message: 'to must not be before from', path: ['to'] };

export const weatherQuery = z.object({ date, from: hour.optional(), to: hour.optional(), cityOverride: city.optional() }).refine(hours, hoursIssue);
export const recommendBody = z
  .strictObject({
    date, from: z.number().int().min(0).max(23).optional(), to: z.number().int().min(0).max(23).optional(),
    occasion: z.enum(OCCASIONS), cityOverride: city.optional(), sessionId: z.uuid().optional(),
    count: z.number().int().min(1).max(3).default(3), useAi: z.boolean().default(true),
  })
  .refine(hours, hoursIssue);
export const feedbackBody = z.strictObject({
  sessionId: z.uuid().optional(),
  action: z.enum(['ACCEPT', 'REJECT', 'MODIFY']),
  garmentIds: z.array(z.uuid()).min(1).max(12).refine((a) => new Set(a).size === a.length, 'ids must be unique'),
});
export const baselineBody = z.strictObject({ cityOverride: city.optional() });

// Response shapes (OpenAPI only; handlers build them from typed objects).
const reason = z.object({ code: z.string(), params: z.record(z.string(), z.union([z.string(), z.number()])).optional() });
const role = z.enum(['TOP', 'BOTTOM', 'ONE_PIECE', 'OUTERWEAR', 'SHOES']);
const summary = z.object({ hours: z.number(), tempAvgC: z.number(), feelsAvgC: z.number(), feelsMinC: z.number(), feelsMaxC: z.number(), precipMax: z.number(), windMax: z.number(), reliability: z.enum(['HIGH', 'MEDIUM', 'LOW']) });
export const weatherResponse = z.object({
  weatherAvailable: z.boolean(), reason: z.string().optional(), date, from: z.number(), to: z.number(),
  location: z.object({ label: z.string(), latitude: z.number(), longitude: z.number(), timezone: z.string() }).optional(),
  source: z.enum(['CACHE', 'PROVIDER']).optional(), provider: z.string().optional(), issuedAt: z.iso.datetime().optional(), summary: summary.optional(),
  hours: z.array(z.object({ hour: z.number(), tempC: z.number(), feelsLikeC: z.number(), precipProbability: z.number(), windKph: z.number(), reliability: z.enum(['HIGH', 'MEDIUM', 'LOW']) })).optional(),
});
export const proposal = z.object({
  fingerprint: z.string(), items: z.array(z.object({ garmentId: z.uuid(), role })), missing: z.array(role),
  reasons: z.array(reason), warnings: z.array(reason),
  assumptions: z.array(z.object({ code: z.string(), garmentId: z.uuid() })),
  weatherSource: z.enum(['CACHE', 'PROVIDER']).nullable(), issuedAt: z.iso.datetime().nullable(),
});
export const recommendResponse = z.object({
  source: z.enum(['RULES', 'RULES+AI']), sessionId: z.uuid(), date, occasion: z.enum(OCCASIONS), comfort: z.enum(['COLD', 'NEUTRAL', 'WARM']),
  weatherAvailable: z.boolean(), manualFallback: z.boolean(),
  weather: z.object({ source: z.enum(['CACHE', 'PROVIDER']).optional(), provider: z.string().optional(), issuedAt: z.iso.datetime().optional(), summary: summary.optional(), location: z.string().optional(), reason: z.string().optional() }),
  proposals: z.array(proposal).max(3), exhausted: z.boolean(),
  ai: z.object({ status: z.enum(['USED', 'NOT_CONFIGURED', 'NO_CONSENT', 'DISABLED', 'QUOTA', 'TIMEOUT', 'ERROR', 'INVALID_OUTPUT', 'SKIPPED']), used: z.number().nullable(), dailyCap: z.number() }),
});
export const feedbackView = z.object({ id: z.uuid(), fingerprint: z.string(), action: z.enum(['ACCEPT', 'REJECT', 'MODIFY']), garmentIds: z.array(z.uuid()), createdAt: z.iso.datetime() });
export const baselineResponse = z.object({ weatherAvailable: z.boolean(), reason: z.string().optional(), issuedAt: z.iso.datetime().optional(), provider: z.string().optional(), summary: summary.nullable().optional() });
export const impactResponse = z.object({
  outfitId: z.uuid(), replaced: z.literal(false), thresholds: z.object({ tempC: z.number(), precipPoints: z.number(), windKph: z.number() }),
  baselineAvailable: z.boolean(), weatherAvailable: z.boolean().nullable(), reason: z.string().optional(), impact: z.boolean(),
  baselineIssuedAt: z.iso.datetime().optional(), currentIssuedAt: z.iso.datetime().optional(), before: summary.optional(), after: summary.optional(),
  changes: z.array(z.object({ metric: z.enum(['TEMPERATURE', 'PRECIPITATION', 'WIND']), before: z.number(), after: z.number(), delta: z.number(), threshold: z.number() })),
  warnings: z.array(z.string()), suggestions: z.array(z.string()),
});
