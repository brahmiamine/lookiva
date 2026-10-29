import { describe, expect, it } from 'vitest';
import { CONSENT_KINDS, CONSENT_PREFERENCE } from '@/modules/identity/domain/consents';

describe('consent kinds', () => {
  it('are_exactly_the_three_documented_kinds', () => {
    expect([...CONSENT_KINDS]).toEqual(['AI_RECOMMENDATIONS', 'LEARNING', 'CLOUD_BACKGROUND_REMOVAL']);
  });

  it('no_kind_covers_photo_recognition_because_photos_never_go_to_an_ai', () => {
    for (const kind of CONSENT_KINDS) expect(kind, kind).not.toMatch(/PHOTO|IMAGE|PICTURE|RECOGNITION|VISION|FACE|OCR/);
  });

  it('only_ai_recommendations_and_learning_mirror_a_preferences_flag', () => {
    expect(CONSENT_PREFERENCE).toEqual({ AI_RECOMMENDATIONS: 'aiEnabled', LEARNING: 'learningEnabled' });
  });
});
