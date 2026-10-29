# Recherche privée trilingue — tranche textuelle de la phase 07

> Exécution dans cette session, conformément à la demande de continuer depuis main et les plans.

**Goal:** livrer une recherche privée FR/EN/AR utilisable sans fournisseur externe.
**Architecture:** enrichir le module wardrobe, propriétaire des vêtements et des référentiels. Lire les données courantes, filtrées par propriétaire et corbeille, puis appliquer le lexique et le classement déterministe. Pas d'index persistant dans cette tranche, donc pas de désynchronisation sur édition/restauration.
**Tech Stack:** Next.js, TypeScript, Prisma/MariaDB, Zod, next-intl, Vitest, Playwright existants. Aucune dépendance ajoutée.
**Spec:** `plans/07-search-semantic-plan.md` (T03–T05, T10–T11 et corpus initial T01/T12).

## Contraintes
- Session, scope propriétaire et exclusion corbeille avant lecture ; groupes joints également filtrés par propriétaire.
- Contraintes structurées strictes ; aucun score ne peut réintroduire un vêtement exclu.
- Texte original inchangé, aucun texte/photo envoyé à un service externe, aucune requête journalisée.
- FR/EN/AR, CSS logique, chargement/erreur/vide, résultats paginés et sélection vers un brouillon non enregistré.
- Corpus initial de régression seulement : ADR-12, mesure de charge et validation dialectale restent ouverts.
- VECTOR/FULLTEXT, fournisseur/dimension embeddings, tables d'index et réindexation différés ; CP-07 ne sera pas déclaré validé.

## Review Focus
1. Accents et diacritiques arabes : même résultat sans altérer le nom.
2. Synonyme dans une autre langue : mêmes IDs de catalogue ; pas de propriété inventée.
3. Filtre contradictoire : zéro résultat malgré le score.
4. Propriétaire étranger/corbeille : aucun résultat, agrégat ou brouillon accessible.
5. Pagination/sélection : ordre déterministe, curseur lié à la requête, rien enregistré avant confirmation explicite.

## Étapes
- [x] Tests de normalisation, corpus trilingue, contraintes, scores, tri et pagination ; exécuter avant implémentation.
- [x] Domaine `search.ts`, port de lecture et service de recherche, adaptateur Prisma sur données vivantes (limite explicite 5000 vêtements).
- [x] API GET/POST `/search/garments`, GET `/search/suggestions`, POST `/search/outfit-draft` ; session, limite 30/min, schémas et OpenAPI.
- [x] Écran `/recherche`, navigation, filtres, sélection ; préremplir l'éditeur existant sans enregistrer automatiquement.
- [ ] Tests réels MariaDB/Redis, tests UI et E2E ciblés ; lint, typecheck, boundaries, suite unitaire, OpenAPI et build.
- [x] Rapport observé et limites restantes.

## Écart constaté en cours de vérification

`origin/main` contient un adaptateur wardrobe/outfits qui utilise encore l'ancien schéma (name, plannedFor,
wornAt, wears). Une régression MariaDB a été ajoutée avant correction ; elle reproduit l'échec de création.
L'adaptateur est maintenant une couche de compatibilité vers title, startsAt, confirmedAt et wearRecords,
avec instantanés complets, activeSlot et représentation UTC des anciens instants sans fuseau. Aucune ancienne
ligne n'est réécrite et aucune migration n'a été modifiée. Cela rétablit TypeScript et le build de production.

La chaîne des migrations contient aussi deux créations de tables de tenues concurrentes ; l'une est tronquée.
La validation de cette chaîne et la stratégie pour les bases déjà installées restent distinctes des tests
fonctionnels effectués sur une base temporaire avec le schéma actuel.

Les vérifications unitaires/intégration, lint, TypeScript, boundaries, OpenAPI et build sont effectuées ; E2E navigateur non exécutés (refus réseau). Voir le rapport pour les limites de la chaîne de migrations.
