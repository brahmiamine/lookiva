# Phase 06 backend report (weather, rules engine, optional AI port)

Branch phase-06-recommendations. No push, no UI, no real provider, no network.

## Critere -> test -> resultat
| Critere | Test | Resultat |
|---|---|---|
| ids owned + AVAILABLE + non trashed, random wardrobes | engine.test only_given_garments...; service.test; reco.int recommend_returns... | PASS |
| 3 distinct or fewer, never padded | never_a_padded_third... | PASS |
| dress valid without bottom | a_dress_is_complete... | PASS |
| cold+rain requires outerwear if owned, else missing[] | cold_and_rain_require... | PASS |
| weather absent -> manualFallback, no invented data | weather_absent..., weather_down_gives_manual_fallback... | PASS |
| AI off/no consent/over quota/timeout/garbage/foreign ids -> rules; no photo in payload | service.test "optional AI" (7 tests) + int ai_needs_consent... | PASS |
| another proposal never repeats | engine + service + int | PASS |
| cross-user isolation | service.test, reco.int another_user... | PASS |
| caches respect TTL (injected clock) | caches_within_ttl... | PASS |
| weather impact thresholds, never replaces outfit | impact_thresholds..., weather_impact_warns... | PASS |
| feedback independent deletion; personalization opt-in | feedback_is_deletable..., personalization_off... | PASS |

Gates: typecheck, lint (0 warnings), boundaries, unit 360, test:int 274, openapi:gen+check, `pnpm verify` (incl. e2e 87) all PASS.
fast-check is not a dependency: seeded mulberry32 generators (150 seeds) used.

## Design / deviations
- Thermal comfort preference already existed (COLD|NEUTRAL|WARM, default NEUTRAL): reused, not duplicated. Added `preferences.personalization` (default false) via identity.
- New: tables weather_snapshots, recommendation_sessions (fingerprint hashes only), recommendation_feedback (id snapshot, no FK), outfit_weather_baselines. Migration 20261104090000_recommendations (rollback header).
- Endpoints: GET /weather, POST /recommendations/outfits, POST|DELETE /recommendations/feedback, DELETE /recommendations/feedback/{id}, POST /outfits/{id}/weather-baseline (needed: outfits store no forecast), GET /outfits/{id}/weather-impact.
- Public APIs added: wardrobe GarmentGateway.listRecommendable, outfits createOutfitReader, identity createPreferencesReader.
- Env: WEATHER_PROVIDER/RECOMMENDATION_AI (none|fake, default none), WEATHER_CACHE_TTL_MIN, WEATHER_DAILY_CALL_CAP, AI_RECOMMENDATION_DAILY_CAP. AI usage observable in response `ai.{status,used,dailyCap}` + logs.

## Risks / owner decisions
ADR-10 real weather/AI/geocoder providers; ADR-08 quotas (defaults are placeholders); accessories not proposed in v1; 1000-garment cap per request; weather snapshots purged after 7 days opportunistically; load test NOT RUN.
