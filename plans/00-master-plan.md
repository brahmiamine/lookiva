# 00 — MASTER PLAN : Dressing intelligent V1 complète

**Ce document orchestre les autres plans et ne donne pas, à lui seul, autorisation de coder.** Chaque phase a un checkpoint à faire approuver avant de modifier le système ou de passer à la suivante. Le dépôt sera fourni plus tard.

## Objectif du projet
Livrer l'application PWA de dressing privé, multi-langues (fr/en/ar RTL), avec inventaire unique par pièce physique, photos, états, tenues multiples/jour, météo et propositions, recherche multilingue, historiques/statistiques, événements/récurrences, valises, notifications et offline limité. Respecter toutes décisions du registre.

## Documents fondamentaux
- `../AGENTS.md` : contrat des agents, interdiction de supposer l'accord de l'utilisateur.
- `../docs/01-decisions-register.md` : décisions issues des 7 questionnaires.
- `../docs/02-business-rules.md` : invariants.
- `../docs/13-adr-open.md` : ADR **proposés non approuvés**, gates.
- `../docs/06-data-model.md` : data model conceptuel.
- `../docs/07-api-contracts.md` : contrats API à matérialiser.
- `../docs/09-acceptance-criteria.md` : recette et preuves.

## Phases ordonnées
| Phase | Plan | Dépendances | Checkpoint |
|---|---|---|---|
| 01 | `01-repository-audit-plan.md` | vrai dépôt fourni, autorisation | CP-01 Audit approuvé |
| 02 | `02-foundation-design-system-plan.md` | CP-01 | CP-02 architecture/design & compatibilité |
| 03 | `03-auth-profiles-i18n-plan.md` | CP-02 | CP-03 contrôle comptes/sessions/RTL |
| 04 | `04-wardrobe-photos-plan.md` | CP-03 | CP-04 inventaire/photos/corbeille |
| 05 | `05-outfits-history-plan.md` | CP-04 | CP-05 port confirmé/lavage distinct |
| 06 | `06-weather-recommendations-plan.md` | CP-05 | CP-06 moteur règles + météo et IA opt-in |
| 07 | `07-search-semantic-plan.md` | CP-04, CP-06 | CP-07 corpus trilingue + index |
| 08 | `08-events-travel-plan.md` | CP-05, CP-06 | CP-08 récurrences et valises |
| 09 | `09-notifications-plan.md` | CP-03, CP-06, CP-08 | CP-09 rappels + push + permissions |
| 10 | `10-analytics-import-export-plan.md` | CP-04, CP-05, CP-08 | CP-10 coût/port et import/export |
| 11 | `11-offline-pwa-sync-plan.md` | CP-04, CP-05 | CP-11 offline privé et idempotent |
| 12 | `12-security-performance-deployment-plan.md` | modules précédents | CP-12 charge, sécurité, backups, prod préparée |
| 13 | `13-final-acceptance-plan.md` | 01..12 | CP-13 validation complète / go-no-go |

## Dépendances transversales
- Auth + permissions avant données privées.
- Référentiels + dressing avant outfits/recherche/valises.
- `WearRecord` source des statistiques et feedback historique ; no auto wash.
- Stockage privé et upload sécurisé avant photo réelle.
- Moteur déterministe avant IA ; recherche SQL texte avant vecteur.
- Planification/événements avant création de rappels.
- API versionnée et schémas validation/OpenAPI dès les premiers endpoints.
- i18n, RTL, a11y, tests, sécurité et observabilité **à chaque phase** ; la phase 12 est revue finale et non report de la sécurité.

## Politique de version
Avant setup, vérifier versions stables compatibles des outils. Ne pas imposer « latest » sans test. Pin exact dans lockfile + documentation ; migrations reproductibles, feature flags IA/notifications/offline selon les pilotes.

## Gate d'acceptation générique par phase
- Tâches approuvées réalisées sans élargir périmètre.
- Tests unit/int/E2E selon pertinence passés **sur environnement réel**, preuves datées.
- Autorisations par utilisateur et journaux sans PII testés.
- OpenAPI synchronisé, migrations appliquées sur environnement temporaire et rollback évalué.
- FR/EN/AR, RTL, mobile et WCAG 2.2 AA cible contrôlés pour écrans touchés.
- Conditions d'échec/fallback/cas limites traités.
- Revue de décision, risques et coûts ; checkpoint signé par propriétaire avant suivant.

## Liste des ADR à ne pas oublier
ADR-01..ADR-12 non approuvés (`../docs/13-adr-open.md`) : capacité MAU vs simultanéité, révocation session, horizon récurrences, taux utilisation, doublons import, historique minimal purge, categories notifications off, quotas IA, dimensionnement, fournisseurs, références après suppression, qualité corpus recherche. Certains principes sont validés mais leur implémentation ne l'est pas.

## Actions interdites sans accord
Créer le repo cible, effacer fichiers existants, modifier `main`, push, déployer production, souscrire service payant, publier données privées, envoyer des photos à IA, installer un agent sur le VPS, exécuter migrations destructrices.

## Journal d'avancement exigé
Pour chaque checkpoint : phase, date, commit, tâches réalisées, décisions prises, commandes/tests/résultats, captures (sans secrets), sécurité/données, perf le cas échéant, questions non résolues et demande claire de validation.
