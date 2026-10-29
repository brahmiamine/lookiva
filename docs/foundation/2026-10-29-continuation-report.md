# Continuation Lookiva — 29 octobre 2026

## Résultat

Branche `work` avancée sans conflit de `5fac113` vers le `origin/main` disponible (`1497e9f`), puis développement
local de la première tranche de recherche privée FR/EN/AR. Aucun push, déploiement ou abonnement externe.
Le développement complet des phases 07 à 13 n'est pas déclaré terminé ; CP-07 n'est pas validé.

## Analyse de main et des plans

Le code de main est beaucoup plus avancé que l'ancien checkout : identité, dressing, photos, groupes,
tenues, historique de port, lavage facultatif et recommandations existent déjà (phases 03 à 06).
Les plans sont la seule source produit disponible : les documents de décisions et ADR qu'ils citent
ne sont pas présents. La suite retenue correspond à `plans/07-search-semantic-plan.md` : livrer d'abord
le chemin textuel fonctionnel avant l'intégration d'un fournisseur d'embeddings.

Deux défauts préexistants ont été reproduits :

1. L'ancien adaptateur `src/modules/wardrobe/infrastructure/prisma-outfit-store.ts` employait les champs
   `name`, `plannedFor`, `wornAt`, `wears` et des instantanés incompatibles avec le schéma de main.
   Une régression sur MariaDB a échoué avec `Unknown argument name` avant correction. L'adaptateur traduit
   désormais ces anciens DTO vers le schéma courant, avec nouveaux IDs d'items, rôle OTHER pour l'ancienne
   interface sans rôle, instantanés complets et `activeSlot`. Les anciens instants sans fuseau sont représentés
   en UTC. Aucun historique existant n'est réécrit. La compilation TypeScript et le build sont rétablis.
2. La migration `20261103090000_outfits` crée les tables modernes, puis
   `20261103090000_outfits_wear_records` tente de recréer les mêmes tables et contient un CREATE TABLE
   incomplet. La migration `20261104090000_outfit_planning` emploie encore l'ancien schéma (`plannedFor`,
   nouvel `occasion` déjà présent). L'application de la chaîne sur la base temporaire a échoué avec
   `ERROR 1050: Table outfits already exists`. Ces migrations n'ont pas été modifiées : la stratégie de
   réparation doit tenir compte des migrations déjà enregistrées dans chaque installation et préserver
   l'historique. Aucun état de base utilisateur n'a été inspecté ou modifié.

## Travaux livrés

- Domaine de recherche `text-v1` : normalisation Unicode/accents/diacritiques et variantes arabes,
  libellés trilingues du catalogue, synonymes ciblés (dont basket/sneaker/trainers et quelques alias
  dialectaux explicitement testés), correction estimée d'une faute au plus sur un terme de catalogue
  suffisamment long et non ambigu. Les négations de propriétés sont signalées comme non prises en charge.
- Contraintes structurées strictes et intersection avec les caractéristiques reconnues dans la requête.
  Tous les mots personnels restants doivent correspondre ; pas de repli silencieux vers « tout ».
- Lecture Prisma des données courantes du propriétaire, hors corbeille. Notes, noms de groupes et
  sous-catégories personnalisées inclus ; les relations vers les groupes sont aussi filtrées par propriétaire.
  Aucune photo, clé de stockage ou donnée privée n'est envoyée à un service externe.
- Classement déterministe expliqué (catalogue, texte personnel, filtres), tri pertinence/date/disponibilité,
  curseur lié au propriétaire et à la requête. Erreur explicite après disparition de l'ancre ou au-delà
  de 5000 candidats. Pas d'index persistant dans cette tranche ; les modifications sont visibles immédiatement.
- API session/CSRF/rate limit/no-store : GET et POST `/api/v1/search/garments`,
  GET `/api/v1/search/suggestions`, POST `/api/v1/search/outfit-draft`. OpenAPI régénéré.
  Les contrats des chemins déjà présents dans le précédent OpenAPI restent sémantiquement identiques ;
  la régénération réordonne certains chemins et inclut aussi `/garments/{id}/wears`, déjà existant dans main.
- Écran `/fr/recherche`, `/en/recherche`, `/ar/recherche` et navigation : formulaire, filtres, pagination,
  explications, sélection, chargement, erreurs, vide et traductions.
- Sélection de 30 pièces maximum vers l'éditeur existant, sans création automatique. Les paramètres d'URL
  sont bornés/validés et l'accès aux pièces est revérifié côté serveur. L'enregistrement explicite conserve
  les contrôles existants du module tenues.

Aucune dépendance du projet, aucun schéma Prisma ni aucune migration n'a été modifié.
Les fichiers concernés sont dans `src/modules/wardrobe/{domain,application,infrastructure,api}/search*`,
`src/modules/wardrobe/infrastructure/prisma-search-reader.ts`, l'adaptateur de compatibilité cité plus haut,
`src/app/api/v1/search/`, `src/app/[locale]/(app)/recherche/`, l'éditeur de tenues, la navigation,
les catalogues i18n, OpenAPI, README, les tests et le plan d'exécution.

## Vérifications observées

| Vérification | Résultat |
|---|---|
| `pnpm test` (après les derniers ajouts) | PASS : 61 fichiers, 393 tests |
| Suite d'intégration complète sur schéma temporaire préparé, avec configuration temporaire sans globalSetup natif | PASS : 21 fichiers, 279 tests à cette exécution |
| Intégrations recherche + compatibilité après ajout du test CSRF/budget | PASS : 2 fichiers, 6 tests (5 recherche + 1 compatibilité) |
| `pnpm exec eslint .` | PASS |
| `pnpm exec tsc --noEmit` | PASS après correction de l'adaptateur |
| `pnpm boundaries` | PASS : aucune violation |
| `pnpm openapi:gen` puis `pnpm openapi:check` | PASS |
| `NEXT_TELEMETRY_DISABLED=1 pnpm exec next build --webpack` | PASS : compilation, TypeScript, génération et finalisation ; routes de recherche présentes |
| `pnpm secrets:scan` | PASS |
| `git diff --check` | PASS |
| `pnpm exec playwright test e2e/search.spec.ts --list` | PASS : 5 projets détectés (FR/EN/AR desktop et FR/AR mobile) ; ce n'est pas une exécution navigateur |
| Exécution navigateur, axe réel, captures, reflow/RTL réel | NOT RUN : téléchargement Chromium refusé (HTTP 403 Domain forbidden sur cdn.playwright.dev) |
| Chaîne normale de migrations | FAIL préexistant : double création de tables et SQL incomplet |
| `pnpm verify` / `pnpm build` / `pnpm test:int` avec leurs wrappers inchangés | Non validés : la génération/migration native Prisma est bloquée par HTTP 403 sur binaries.prisma.sh, en plus du défaut de chaîne SQL |

Les 279 intégrations comprenaient les 274 tests existants et 5 nouveaux à cet instant ; le contrôle ciblé suivant
couvre un sixième test ajouté ensuite. Il ne s'agit pas d'un total de 285 scénarios distincts.

Les tests de recherche couvrent notamment la même requête dans les trois langues, les synonymes, une faute,
les accents/variantes arabes, les filtres contradictoires, les notes/groupes, la corbeille/restauration,
les changements d'état, l'isolation entre deux utilisateurs, les curseurs, CSRF, le budget de 30 appels/minute
et l'absence de persistance d'une tenue à la préparation.

## Limites de l'environnement de test

Node réellement exécuté : 24.19.0 (sous le pin >=24.22.1) ; pnpm disponible : 11.25.0 (projet : 12.15.0).
Le lockfile du projet a été conservé et installé avec `--frozen-lockfile`.

Le téléchargement du moteur natif Prisma étant refusé, le client TypeScript a été généré avec les packages
**officiels Prisma 7.10.1** `@prisma/internals` et `@prisma/client-generator-ts`, installés uniquement dans
un dossier de travail externe au dépôt. L'appel en processus à `getGenerators` avec `skipDownload: true`
utilise le générateur TypeScript/WASM ; aucun faux moteur ni désactivation de TLS/checksum n'a été utilisé.
La commande temporaire était `node /workspace/work/prisma-offline/generate.cjs`.

MariaDB 11.8.9 et Redis 8.10.3 ont été démarrés dans le projet Docker isolé `lookiva-search-test`.
Les migrations valides de main ont été appliquées par le client MariaDB à cette base jetable ; les deux
migrations de l'ancien schéma citées plus haut ont été écartées de **cette préparation temporaire seulement**.
La configuration temporaire Vitest reprenait `vitest.int.config.ts` en désactivant uniquement le globalSetup
qui appelle le moteur natif. La suite a été exécutée avec :

```sh
pnpm exec vitest run --config /workspace/work/search.int.config.mts
pnpm exec vitest run --config /workspace/work/search.int.config.mts tests/search/search.int.test.ts tests/wardrobe/legacy-outfits.int.test.ts
```

Ces résultats valident les comportements sur le schéma courant, **pas** l'installation complète depuis les
migrations versionnées. Les conteneurs et volumes temporaires sont arrêtés et retirés en fin de tâche.

## Suite nécessaire

1. Réconcilier la chaîne des migrations après inventaire des installations existantes ; ne pas effacer ou
   réinitialiser une base utilisateur pour contourner les conflits.
2. Autoriser les domaines requis par Prisma et Playwright dans la configuration d'environnement, puis
   rejouer la génération/migration normales et les E2E FR/EN/AR/RTL/mobile/accessibilité.
3. Pour la suite CP-07 : approuver corpus/métriques et fournisseur/modèle/dimension d'embeddings ; POC réel
   VECTOR/FULLTEXT, indexation/réconciliation et mesures de charge. Les alias dialectaux testés ne constituent
   pas une couverture générale des dialectes.
4. Reprendre ensuite les phases 08 à 13 selon `plans/00-master-plan.md` : événements/valises, notifications,
   statistiques/import/export, PWA/synchronisation, sécurité/performance et recette finale.
