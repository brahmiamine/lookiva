import { z } from 'zod';
import { LOCALES, THERMAL_SENSITIVITIES, isIanaTimeZone } from '../domain/preferences';

// Format is checked after NFKC normalisation in the application (so fullwidth or decomposed input is accepted).
// The RAW value is capped too: it is what the VARCHAR(254) display column stores, and NFKC can shrink it.
const email = z.string().min(3).max(254);
const password = z.string().min(1).max(1024);
// Any string is hashed and looked up: malformed, unknown, used and expired tokens all get the same 400 INVALID_TOKEN.
const token = z.string().min(1).max(256);
const timezone = z.string().max(64).refine(isIanaTimeZone, { message: 'invalid_timezone' });
const cityName = z.string().trim().min(1).max(120);
const countryCode = z.string().regex(/^[A-Z]{2}$/, { message: 'ISO 3166-1 alpha-2' });
const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);

/** Latitude and longitude come together (both set, both null or both absent). */
const pairedCoordinates = (p: { latitude?: number | null; longitude?: number | null }) =>
  (p.latitude === undefined) === (p.longitude === undefined) && (p.latitude === null) === (p.longitude === null);
const pairIssue = { message: 'latitude and longitude go together', path: ['latitude'] };

export const registerBody = z.object({ email, password, locale: z.enum(LOCALES).default('fr') });
export const reauthBody = z.object({ password });
export const emailBody = z.object({ email });
export const loginBody = z.object({ email, password });
export const tokenBody = z.object({ token });
export const resetBody = z.object({ token, password });

export const citiesQuery = z.object({ q: z.string().trim().min(2).max(80) });
export const cityCandidate = z.object({
  name: z.string(),
  countryCode: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  timezone: z.string(),
});
export const citiesResponse = z.object({ items: z.array(cityCandidate).max(5) });

export const preferencesPatchBody = z
  .strictObject({
    locale: z.enum(LOCALES).optional(),
    cityName: cityName.optional(),
    countryCode: countryCode.nullable().optional(),
    latitude: latitude.nullable().optional(),
    longitude: longitude.nullable().optional(),
    timezone: timezone.optional(),
    aiEnabled: z.boolean().optional(),
    learningEnabled: z.boolean().optional(),
    thermalSensitivity: z.enum(THERMAL_SENSITIVITIES).optional(),
  })
  .refine(pairedCoordinates, pairIssue);

export const onboardingBody = z
  .strictObject({
    locale: z.enum(LOCALES),
    cityName,
    countryCode: countryCode.nullable().optional(),
    latitude: latitude.nullable().optional(),
    longitude: longitude.nullable().optional(),
    timezone: timezone.optional(),
  })
  .refine(pairedCoordinates, pairIssue);

// ---------------------------------------------------------------- responses (OpenAPI)

export const acceptedResponse = z.object({ status: z.literal('accepted') });
export const verifiedResponse = z.object({ status: z.literal('verified') });
export const passwordResetResponse = z.object({ status: z.literal('password_reset') });
export const meResponse = z.object({
  id: z.uuid(),
  email: z.string(),
  emailVerifiedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export const loginResponse = z.object({ user: meResponse });
export const sessionsResponse = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      userAgent: z.string(),
      createdAt: z.iso.datetime(),
      lastSeenAt: z.iso.datetime(),
      current: z.boolean(),
    }),
  ),
  nextCursor: z.string().optional(),
});
export const deletionRequestResponse = z.object({
  status: z.literal('pending'),
  requestedAt: z.iso.datetime(),
  message: z.string(),
});
export const deletionCancelledResponse = z.object({ status: z.literal('cancelled') });
export const exportRequestView = z.object({ id: z.uuid(), status: z.literal('PENDING'), requestedAt: z.iso.datetime() });
export const exportRequestsResponse = z.object({ items: z.array(exportRequestView), nextCursor: z.string().optional() });
export const preferencesResponse = z.object({
  locale: z.enum(LOCALES),
  cityName: z.string().nullable(),
  countryCode: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  timezone: z.string().nullable(),
  aiEnabled: z.boolean(),
  learningEnabled: z.boolean(),
  thermalSensitivity: z.enum(THERMAL_SENSITIVITIES),
  onboardingCompletedAt: z.iso.datetime().nullable(),
  version: z.number().int(),
});
