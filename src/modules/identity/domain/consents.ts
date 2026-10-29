/**
 * Every consent a user can give. Photos are NEVER sent to an AI (product rule, plans/03): no kind covers photo
 * recognition or any other use of photos by a model, so none can be granted. Adding such a kind is forbidden;
 * tests/identity/consents.test.ts fails if a kind name mentions photos, images or recognition.
 * CLOUD_BACKGROUND_REMOVAL is the only photo-related kind: a processing step on the photo's pixels, not recognition.
 */
export const CONSENT_KINDS = ['AI_RECOMMENDATIONS', 'LEARNING', 'CLOUD_BACKGROUND_REMOVAL'] as const;
export type ConsentKind = (typeof CONSENT_KINDS)[number];

/** Kinds that mirror a preferences flag, kept equal to the latest consent in the same transaction. */
export const CONSENT_PREFERENCE = { AI_RECOMMENDATIONS: 'aiEnabled', LEARNING: 'learningEnabled' } as const satisfies Partial<
  Record<ConsentKind, 'aiEnabled' | 'learningEnabled'>
>;

export const isConsentKind = (s: string): s is ConsentKind => (CONSENT_KINDS as readonly string[]).includes(s);
