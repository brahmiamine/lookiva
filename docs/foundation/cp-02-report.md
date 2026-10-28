# Rapport CP-02 — Phase 02 (socle technique et design system)

| | |
|---|---|
| Phase | 02 — socle technique, monolithe modulaire, design system |
| Date des exécutions | 2026-10-28 (entre 17:16 et 17:30, heure locale CET) |
| Branche | `phase-02-foundation` (locale, aucun remote, aucun push) |
| HEAD au moment des exécutions | `9edd0b9` (`fix: isolate verify infra in its own compose project`) ; le commit de ces trois documents vient juste après |
| Arbre de travail avant ajout des documents | propre (`git status --short` : aucune ligne) |
| Environnement | macOS, Docker 28.3.3 / Compose 2.39.1, Node **v24.11.1** (le pin est 24.22.1), pnpm 12.15.0 via `packageManager` (sorties réelles : `node --version` → `v24.11.1`, `pnpm --version` → `12.15.0`) ; `corepack enable` et une installation depuis un clone vierge n'ont **pas** été exécutés (`NOT RUN`) |
| Statut de validation | **CP-02 NON SIGNÉ.** Voir la dernière section. |

Convention : `Critère → Commande/test → Résultat → Preuve`. Tout ce qui n'a pas été exécuté est `NOT RUN`. Les sorties ci-dessous sont celles de cette session, tronquées aux lignes utiles sans modification.
Tous les mots de passe et jetons visibles sont les placeholders `change-me` de `.env.example`.

## Sommaire des critères (spec §11)

| # | Critère | Résultat |
|---|---|---|
| 1 | Architecture modulaire documentée et démarrable localement | Réussi (voir limites) |
| 2 | Design system et maquettes principales approuvés | Approuvés en conversation ; validation formelle CP-02 en attente |
| 3 | `verify` vert en environnement isolé | Réussi, exit 0, 47 s |
| 4 | DB et Redis non exposés | Réussi pour `stack:up` ; ports hôte loopback uniquement avec l'overlay de test |
| 5 | Aucun secret committé | Réussi sur l'arbre de travail ; historique git `NOT RUN` |
| 6 | Rapport avec `NOT RUN` explicites | Ce document |

## Critère 1 — Architecture documentée et démarrable localement

| Commande/test | Résultat | Preuve |
|---|---|---|
| Documents : `README.md`, `docs/foundation/runbook-local.md`, `docs/foundation/compat-matrix.md`, spec et plan de la phase | Écrits | fichiers committés |
| `pnpm boundaries` (dans `verify`) | exit 0 | `✔ no dependency violations found (83 modules, 132 dependencies cruised)` |
| `pnpm infra:up` + `pnpm test:int` (dans `verify`, projet `lookiva-verify`) | exit 0, 14 s | `Applying migration 20261028150000_init_idempotency`, `Test Files 3 passed (3)`, `Tests 15 passed (15)` |
| `pnpm stack:up` (pile complète en conteneurs) | exit 0, 17,9 s | voir sortie ci-dessous |
| `pnpm dev` lancé à la main | `NOT RUN` dans cette session ; `next dev` est exercé par `pnpm test:e2e` (21 tests passés) | — |
| Module métier réel | Aucun n'existe (hors périmètre phase 02) ; les règles de frontières sont testées sur des fixtures | `tests/boundaries` |

### `pnpm stack:up` et matrice curl

```
$ pnpm stack:up
 lookiva-worker  Built
 lookiva-web  Built
 Network lookiva_internal  Created
 Volume "lookiva_db-data"  Created
 ...
 Container lookiva-redis-1  Healthy
 Container lookiva-db-1  Healthy
 Container lookiva-worker-1  Healthy
 Container lookiva-web-1  Healthy
pnpm stack:up  1.63s user 1.63s system 18% cpu 17.913 total          EXIT=0

$ docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}'
NAMES              IMAGE            PORTS                      STATUS
lookiva-web-1      lookiva-web      127.0.0.1:3000->3000/tcp   Up 5 seconds (healthy)
lookiva-worker-1   lookiva-worker                              Up 5 seconds (healthy)
lookiva-db-1       mariadb:11.8.9   3306/tcp                   Up 11 seconds (healthy)
lookiva-redis-1    redis:8.10.3     6379/tcp                   Up 11 seconds (healthy)
```

(Un conteneur `buildx_buildkit_multiplatform-builder0` tournait déjà avant la session et n'appartient pas à Lookiva.)

| Requête | Attendu | Obtenu |
|---|---|---|
| `GET http://127.0.0.1:3000/api/v1/health` | 200 | `HTTP 200` `{"status":"ok"}` |
| `GET /api/v1/ready` sans jeton | 401 | `HTTP 401` `{"type":"urn:lookiva:problem:UNAUTHORIZED","title":"Unauthorized","status":401,"code":"UNAUTHORIZED","detail":"Authentication required","requestId":"01a1834e-..."}` |
| `GET /api/v1/ready` avec `Authorization: Bearer change-me` | 200 | `HTTP 200` `{"status":"ok","checks":{"db":"ok","redis":"ok"}}` |
| `GET /fr` | `lang="fr" dir="ltr"` | `<html lang="fr" dir="ltr">` |
| `GET /ar` | `lang="ar" dir="rtl"` | `<html lang="ar" dir="rtl">` |
| `GET /de/x` | 307 | `HTTP/1.1 307 Temporary Redirect`, `location: /fr/x` |
| `GET /fr/dev/ui` (build de production) | 404 | `HTTP 404` |

Limites : la requête `/ready` avec jeton prouve la jonction web → db et web → redis dans le réseau compose ; les tables ne sont pas migrées dans cette pile.

## Critère 2 — Design system et maquettes approuvés

| Commande/test | Résultat | Preuve |
|---|---|---|
| Direction **B · Studio** choisie (spec §3) | Approuvée par le propriétaire en conversation le 2026-10-28 ; également consignée comme décision actée dans la spec §3 (spec elle-même en brouillon marqué « à relire ») | note du ledger : « USER GATE PASSED: user approved the mockups (docs/design/mockups) » ; aucune trace écrite dans le dépôt en dehors de ce rapport |
| Maquettes `docs/design/mockups/` (index, dressing, dressing-ar, fiche-vetement, recherche, tenue-du-jour) | Approuvées en conversation après la tâche 11 | commits `03b7e6b`, `2102bf3` |
| Matrice de compatibilité | Validée en conversation (gate de la tâche 1) | commits `5d3a3d7`, `0f4d2e4` |
| Tests UI (`pnpm test`, dans `verify`) : contrastes, CSS physique interdit, composants (Dialog, TextField...), galerie, calendrier, page dev | 23 fichiers, 95 tests passés | sortie de `verify` ci-dessous |
| Playwright + axe sur `/{fr,en,ar}/dev/ui` (wcag2a, wcag2aa, wcag21a/aa, wcag22aa) | 0 violation, clavier (Tab, Escape), RTL, pas de défilement horizontal à 375 px (et 360 px exploratoire) | 21 passés, 3 ignorés |
| Validation **formelle** CP-02 par le propriétaire | **EN ATTENTE** | dernière section |

## Critère 3 — `verify` vert en environnement isolé

Commande : `rm -rf src/generated .next dist` puis `pnpm verify` (exit 0 ; `time` : 47,395 s total). Le projet compose utilisé est `lookiva-verify`, distinct du projet de développement `lookiva`.

```
$ bash scripts/verify.sh
==> teardown: pnpm infra:down (project lookiva-verify)
== STEP: preflight (leftover project, ports)
-- OK: preflight (leftover project, ports) (0s)
== STEP: db:generate
✔ Generated Prisma Client (7.10.1) to ./src/generated/prisma in 18ms
-- OK: db:generate (1s)
== STEP: lint
-- OK: lint (3s)
== STEP: typecheck
-- OK: typecheck (2s)
== STEP: boundaries
✔ no dependency violations found (83 modules, 132 dependencies cruised)
-- OK: boundaries (1s)
== STEP: unit tests
 RUN  v5.0.5
 Test Files  23 passed (23)
      Tests  95 passed (95)
   Duration  3.00s
-- OK: unit tests (3s)
== STEP: integration tests (infra up/down)
 Network lookiva-verify_internal  Created
 Volume "lookiva-verify_db-data"  Created
 Container lookiva-verify-db-1  Healthy
 Container lookiva-verify-redis-1  Healthy
 Container lookiva-verify-worker-1  Healthy
Datasource "db": MySQL database "lookiva" at "127.0.0.1:3307"
1 migration found in prisma/migrations
Applying migration `20261028150000_init_idempotency`
All migrations have been successfully applied.
 Test Files  3 passed (3)
      Tests  15 passed (15)
   Duration  1.29s
-- OK: integration tests (infra up/down) (14s)
==> teardown: pnpm infra:down (project lookiva-verify)
 Volume lookiva-verify_db-data  Removed
 Network lookiva-verify_internal  Removed
== STEP: openapi:check
openapi.json is up to date.
-- OK: openapi:check (1s)
== STEP: build
▲ Next.js 16.4.3 (Turbopack)
✓ Compiled successfully in 2.7s
Route (app)
┌ ○ /_not-found
├   /[locale]
│ ├ ● /fr  ● /en  ● /ar
├ ƒ /[locale]/dev/ui
├ ƒ /api/v1/health
└ ƒ /api/v1/ready
ƒ Proxy (Middleware)
-- OK: build (8s)
== STEP: e2e install (chromium)
-- OK: e2e install (chromium) (0s)
== STEP: e2e smoke (playwright)
Running 24 tests using 4 workers
  3 skipped
  21 passed (12.0s)
[360px exploratory] scrollWidth=360 innerWidth=360 overflow=false
-- OK: e2e smoke (playwright) (13s)
== STEP: secret scan
$ secretlint "**/*"
-- OK: secret scan (0s)
== verify: ALL STEPS PASSED (47s)
EXIT=0
```

Notes : le clone n'était pas neuf (dépendances installées, image Chromium et couches Docker en cache), d'où la durée courte. Les 3 tests ignorés sont `no_horizontal_scroll_on_mobile` sur les projets desktop (voulu : projet mobile seulement). L'exécution a eu lieu sur Node 24.11.1 : le pin 24.22.1 n'a pas été exercé.

## Critère 4 — DB et Redis non exposés

| Commande/test | Résultat | Preuve |
|---|---|---|
| `tests/infra/compose.test.ts` (dans `pnpm test`) : aucun port publié sur db/redis dans `compose.yaml`, ports de l'overlay en loopback | passé | 95 tests unitaires passés |
| `docker ps` pendant `stack:up` | db `3306/tcp`, redis `6379/tcp` : **non publiés** ; web `127.0.0.1:3000->3000/tcp` | sortie ci-dessus |
| `docker inspect` pendant `stack:up` | `lookiva-db-1 {"3306/tcp":null}`, `lookiva-redis-1 {"6379/tcp":null}`, `lookiva-worker-1 {}`, `lookiva-web-1 {"3000/tcp":[{"HostIp":"127.0.0.1","HostPort":"3000"}]}` | |
| `nc -z 127.0.0.1 <port>` pendant `stack:up` | `3307 closed`, `6380 closed`, `3306 closed`, `6379 closed` ; `3000 OPEN` (web) ; `lsof` : seul `127.0.0.1:3000 (LISTEN)` | |
| `nc -z <IP LAN de la machine> 3000` | `closed` (web lié à loopback) | |

Précision : les ports hôte `127.0.0.1:3307` (MariaDB) et `127.0.0.1:6380` (Redis) existent seulement quand l'overlay `compose.test.yaml` est utilisé (`pnpm infra:up`, `pnpm verify`) pour que les tests tournent depuis l'hôte ; ils sont liés à loopback. La preuve « fermé » ci-dessus porte sur la pile `stack:up`, qui n'utilise pas l'overlay. L'accessibilité de db/redis à travers un réseau réel (autre machine) est `NOT RUN`.

## Critère 5 — Aucun secret committé

| Commande/test | Résultat | Preuve |
|---|---|---|
| `pnpm secrets:scan` (`secretlint "**/*"`, préréglage recommended + règle AWS avec `enableIDScanRule`) | exit 0, aucune détection | `$ secretlint "**/*"` puis `EXIT=0` |
| `tests/verify/secret-scan.test.ts` : une clé factice fait échouer le scan, `.env.example` le passe | passé (dans les 95 tests) | |
| `git ls-files \| grep -E "\.env"` | seul `.env.example` est suivi ; `.env` et `.env.*` sont ignorés | `git check-ignore -v .env` → `.gitignore:7` |
| `git ls-files .superpowers` | 0 fichier (dossier ignoré) | |
| Valeurs dans `.env.example` | placeholders `change-me` uniquement | `.env.example` |
| Scan de l'historique git complet (21 commits) | `NOT RUN` | — |

Limites : `secretlint` respecte `.gitignore` et `.secretlintignore`, qui compte 8 entrées (`node_modules`, `.next`, `dist`, `src/generated`, `.superpowers`, `playwright-report`, `test-results`, `pnpm-lock.yaml`). `.env.example` n'est **pas** ignoré : il est scanné et passe grâce au motif `allows` du placeholder `change-me` de `.secretlintrc.json`, qui compte deux motifs étroits (placeholder `change-me` et une chaîne de test exacte). `enableIDScanRule: true` est nécessaire sur la règle AWS car le préréglage recommended ne signale pas les identifiants de clé d'accès AWS par défaut (sans l'option, une clé factice sortait en code 0, voir la matrice de compatibilité).

## État git

```
$ git log --oneline
9edd0b9 fix: isolate verify infra in its own compose project
34ceb2c chore: verify pipeline, secret scan and web service
315f87d test: playwright matrix with axe and rtl checks
bda49a2 feat: gallery, cards, calendar and dev ui page
2c2e9a4 fix: keep generated ids and aria wiring when TextField receives caller props
d6a8dfa feat: base accessible components
2102bf3 test: harden physical css detector for style objects and bg/object/origin utilities
03b7e6b feat: design tokens, contrast checks and mockups for review
0f258d3 feat: i18n routing, rtl and formats
9081a5c feat: openapi generation and health/ready endpoints
2c533ee fix: exact collation and safe post-run persistence for idempotency
1b007ce feat: idempotency records and withIdempotency
17dc427 feat: http core (errors, pagination, ids, etag, owner scope)
e8475ba feat: platform ports, fakes, bullmq queue and worker
5602161 feat: structured logger with redaction
c087ebf chore: enforce module boundaries with dependency-cruiser
8ea4467 chore: add local compose for mariadb and redis
6925736 chore: scaffold project with strict TS and env validation
0f4d2e4 docs: address review findings on compat matrix
5d3a3d7 docs: add compatibility matrix and prisma/mariadb poc results
361a0e4 docs: baseline plans, Phase 02 spec and implementation plan

$ git status --short        (avant ajout des 3 documents)
(vide)
```

### Arrêt de la pile

```
$ pnpm stack:down     EXIT=0
 Container lookiva-web-1 / worker-1 / db-1 / redis-1  Removed
 Volume lookiva_db-data  Removed
 Network lookiva_internal  Removed
$ docker ps       → seul buildx_buildkit_multiplatform-builder0 (préexistant, hors projet)
$ docker volume ls / docker network ls | grep lookiva   → vide
$ nc -z 127.0.0.1 {3000,3100,3307,6380}   → tous closed
```

## Couverture du plan 02 (T01..T12)

Les identifiants T01..T12 sont ceux de `plans/02-foundation-design-system-plan.md`. Les « Task n » du plan d'implémentation (`docs/superpowers/plans/`) sont entre parenthèses.

| Plan 02 | Livraison | Commits | Statut |
|---|---|---|---|
| T01 topologie, frontières | `.dependency-cruiser.cjs` (4 règles), `pnpm boundaries`, tests sur fixtures ; documenté par le README de T12 (ce commit) | `c087ebf` | Partially : règles appliquées et testées, mais aucun module réel (voulu) ; la règle app/ui/platform → internes d'un module est à ajouter avant la phase 03 |
| T02 versions et POC Prisma + MariaDB | `docs/foundation/compat-matrix.md`, pins exacts dans `package.json` (Tasks 1-2) | `5d3a3d7`, `0f4d2e4`, `6925736` | Done. Matrice validée par le propriétaire en conversation. POC sur Node 24.11.1 / pnpm 11.22.0, lignes « registre/doc seulement » pour Node 24.22.1, Redis 8, BullMQ |
| T03 validation, erreurs, pagination, IDs, ETag, idempotence, OpenAPI | `src/platform/http/*`, `src/platform/openapi`, `prisma/` (Tasks 7, 8, 9) | `17dc427`, `1b007ce`, `2c533ee`, `9081a5c` | Done |
| T04 Docker local DB/Redis/worker | `compose.yaml`, `compose.test.yaml`, `Dockerfile`, profil `app`, `tests/infra/compose.test.ts` (Tasks 3, 6, 15) | `8ea4467`, `e8475ba`, `34ceb2c`, `9edd0b9` | Done |
| T05 squelette modules et abstractions providers | ports + fakes `src/platform/{db,storage,weather,email,embeddings,ai,clock,queue,audit}`, queue BullMQ, worker (Task 6) | `e8475ba` | Partially : ports et adapters présents, aucun adapter réel (hors périmètre) ; le répertoire `src/modules/` n'existe pas encore |
| T06 App Router localisé, RTL, repli FR | `src/proxy.ts`, `src/i18n/*`, `src/app/[locale]/layout.tsx` (Task 10) | `0f258d3`, `bda49a2` | Done. Rendu arabe réel sur appareil `NOT RUN` |
| T07 directions de design, tokens, maquettes | `src/ui/tokens.css`, `src/ui/contrast.ts`, `docs/design/mockups/` (Task 11) | `03b7e6b`, `2102bf3` | Done. Direction B choisie et maquettes approuvées en conversation (pas de signature écrite) |
| T08 composants accessibles | Button, TextField, Dialog, Gallery, GarmentCard, OutfitCard, MonthCalendar, StatusBadge, états vide/chargement/erreur (Tasks 12, 13) | `d6a8dfa`, `2c2e9a4`, `bda49a2` | Done pour les composants listés ; audit manuel clavier/zoom/lecteur d'écran `NOT RUN` |
| T09 pipeline CI | `scripts/verify.sh` (`pnpm verify`) (Task 15) | `34ceb2c`, `9edd0b9` | Partially : commande unique `verify` seulement ; **aucun workflow de CI** car l'hébergement du code n'est pas choisi ; aucun déploiement automatique |
| T10 observabilité, health/readiness, redaction, secrets, env de test | logger pino avec redaction (Task 5), `/health` `/ready` (Task 9), secretlint (Task 15), `.env.example` + validation Zod | `5602161`, `9081a5c`, `34ceb2c` | Partially : socle local fait ; pas de plan de gestion des secrets de production ni de métriques (phase 12) |
| T11 smoke tests téléphone/desktop FR/EN/AR, direction, clavier | `e2e/dev-ui.spec.ts`, `playwright.config.ts` (Task 14) | `315f87d` | Partially : Chromium uniquement, **viewports émulés** (desktop 1280 et mobile 375 px), pas d'appareil réel ; page de démo seulement, pas d'écrans produit |
| T12 documentation, plan de migration, coûts ouverts | `README.md`, `docs/foundation/runbook-local.md`, ce rapport (Task 16) | commit de ces documents | Done à la livraison ; la validation CP-02 reste à donner |

Vérifications obligatoires du plan : tests DB et Redis sous Compose isolé (fait, `verify`) ; TypeScript strict, lint, build, cohérence OpenAPI (fait) ; formulaires accessibles clavier (fait en jsdom et Playwright) mais **zoom** non testé manuellement ; RTL ar et repli FR (testés) ; aucun secret et DB/Redis privés (critères 4 et 5).

## NOT RUN / non vérifié

- Appareils réels iOS et Android (téléphones, tablettes) : `NOT RUN`.
- Rendu réel de l'arabe (polices, ligatures, chiffres) sur appareils : `NOT RUN` (spec §7 : pile de polices à valider sur appareils réels).
- Audit manuel WCAG (lecteur d'écran, clavier complet, zoom 200 % et 400 %, mouvement réduit) : `NOT RUN`, prévu en phase 12. Seul `axe-core` automatique a tourné, dialogue fermé.
- Safari, WebKit, Firefox : `NOT RUN` (Chromium seul).
- Charge et performance (Lighthouse, Web Vitals, charge sur 1 000 utilisateurs) : `NOT RUN`.
- Déploiement de production, VPS OVH, DNS, TLS : `NOT RUN`.
- Sauvegarde et restauration MariaDB / Redis : `NOT RUN`.
- Endurance BullMQ/Redis (longue durée, reprise après coupure Redis) : `NOT RUN`.
- Reprise de `migrate deploy` depuis une image de production (le CLI Prisma est une devDependency) : `NOT RUN`.
- Node 24.22.1 (pin) : `NOT RUN` ; tout a tourné sur 24.11.1.
- `pnpm install` depuis un clone vierge sans cache et sans corepack préinstallé : `NOT RUN` (dépendances déjà installées).
- `pnpm dev` à la main : `NOT RUN` (`next dev` couvert par Playwright).
- Scan de secrets de l'historique git : `NOT RUN`.
- Reproduction des messages de dépannage Docker / Playwright du runbook : `NOT RUN` (texte standard, non provoqué).
- CI hébergée : n'existe pas.
- Authentification, upload, modules métier, fournisseurs réels : hors périmètre de la phase 02.

## Décisions et rulings

Lignes du ledger de l'orchestrateur contenant `Ruling:`, verbatim, dans l'ordre. « Cost if wrong » est indiqué quand le ledger le donne.

```text
| T2↔T3 | `.env.example` | T3 needs MariaDB vars (root password, db name). Ruling: T3 appends `MARIADB_*` keys to `.env.example`; `Env` type unchanged. |
| T3↔T6↔T15 | `compose.yaml`, `Dockerfile` | T6 and T15 both create `Dockerfile`. Ruling: ONE multi-stage Dockerfile; T6 creates it with a `worker` target, T15 adds a `web` target. T3 test (no db/redis ports) and T15 test (only `web` publishes ports) are consistent. |
| T5↔T7 | Logger in `withApi` | Plan does not say where `withApi` gets its logger. Ruling: `withApi(handler, deps?: { logger?: Logger })`, default lazily `createLogger({ level: getEnv().LOG_LEVEL })`; tests inject an in-memory logger. |
| T7↔T9 | Problem schema | T9 registers error responses in OpenAPI and needs a Zod schema. Ruling: T7 defines `problemSchema` (Zod) in `errors.ts`; `ProblemJson = z.infer<typeof problemSchema>`. |
| T8↔T9↔T15 | Migrations before int tests | Nobody applies Prisma migrations before int tests. Ruling: T8 adds a Vitest int `globalSetup` (`tests/setup/int-global-setup.ts`) running `prisma migrate deploy`; T15 `test:int` wraps it with compose up/down. |
| T9 | Review Focus 4 test | Plan says `docker compose stop db` inside tests: flaky with parallel int tests and breaks other files. Ruling: the readiness checks take injectable targets; down-state is tested with unreachable URLs (e.g. port 1), no container stop. Behavior asserted is unchanged (503 problem+json no stack; /health 200). |
| T9↔T6 | Redis check | Ruling: `/ready` pings Redis with `ioredis` (BullMQ dependency) using `getEnv().REDIS_URL`. |
| T10 | middleware file name | Depends on the Next.js version in the matrix (middleware vs renamed convention). Ruling: implementer follows the matrix' Next version docs. |
| T13↔T14↔T15 | Dev UI page vs production build | Page 404s when NODE_ENV=production (T13) but verify builds before e2e (T15) and T14 axe needs the page. Ruling: Playwright `webServer` runs `next dev` on its own port; the production-404 check stays a unit test. |
Ruling: Git — user authorized `git init` + local commits on branch `phase-02-foundation` (no push, no remote) — needed for per-task commits and review packages — costs: none, reversible by deleting `.git`.
Ruling: User gates kept despite continuous execution — stop after Task 1 (matrix validation) and after Task 11 (mockups approval), as the approved plan states them — they cover version choices and visual direction the user explicitly reserved — costs: two pauses.
Ruling: Task 1 poc/ is not committed (throwaway); only compat-matrix.md is committed.
Task 8: Ruling: (1) use utf8mb4_nopad_bin (bin is still PAD SPACE), hand-edit migration in place (never deployed) + 3 new tests; (2) updateMany({id,status:0}) with count check; on 0 rows or DB error return the true result, never touch other rows, report via opts.onPersistError — a 500 would mislead the client since the side effect happened; known limit: run longer than PENDING_TTL_MS may execute twice — cost if wrong: caller sees success while record is unpersisted (retry after TTL re-executes)
Task 11: Ruling: add those patterns + camelCase family; leave translate-x-* and directional gradients unflagged (documented) — direction-neutral usage exists; cost if wrong: a physical translate-x slips through, must be caught in hand review
Task 12: Ruling: merge caller id/aria-describedby with generated ones (caller id used for both input id and label htmlFor; describedby = caller + error id; error forces aria-invalid) — cost if wrong: none, strictly safer
Task 15: Ruling: run verify under dedicated COMPOSE_PROJECT_NAME=lookiva-verify, always start/teardown only that project, drop the reuse branch, add loud port preflight (3307/6380/3100) — cost if wrong: verify cannot run while a dev stack holds those ports (fails loudly, no data touched)
```

## Constats mineurs reportés

Issus du ledger, une ligne par tâche et par sujet, condensés. À trier à la revue finale ; aucun n'a été corrigé dans cette tâche.

- **Tâche 1** : formulation de la ligne Node (24 en Maintenance, 26 non testé mais pas non supporté) ; empreinte MariaDB tronquée ; alternatives non sourcées (React Aria, zod-openapi, create-next-app, npm/yarn) ; `VERSION()` complet et durée absents du POC ; registre npm comme source par défaut à déclarer en en-tête ; note 8 trop générale ; licence Redis 8 non mentionnée ; note 5 sans preuve isolée pour `@parcel/watcher`/`@swc/core` ; ligne TypeScript « POC + V2 » sans `tsc` dans le log.
- **Tâche 2** : `z.url()` accepte tout schéma pour `DATABASE_URL`/`REDIS_URL` ; mémoïsation de `getEnv()` non testée ni réinitialisable ; `NODE_ENV` vaut `development` par défaut ; test d'env avec try/catch sans `expect.assertions` ; `typescript-eslint` en devDependency directe non importée par la config.
- **Tâche 3** : test « pas de ports » passe si db/redis sont renommés (`?? []`) ; test loopback regroupe db et redis ; test de base ignore `expose`/`network_mode` ; commenter que le réseau `internal` n'est pas `internal: true`.
- **Tâche 4** : `module-public-only` ne contraint que les fichiers dans les modules (à compléter avant le premier vrai module, phase 03) ; cas autorisé sans preuve d'arêtes ; pas de fixture application → sa propre infrastructure ; alias `@/` non testé ; WARN peer-dependency non investigué.
- **Tâche 5** : test comportemental manquant pour `req.headers.authorization`/`cookie` ; vérification brute affaiblie pour le jeton ; la redaction `*.key` ne couvre qu'un niveau ; `logger.error({err})` n'expurge ni message ni pile.
- **Tâche 6** : expiration du faux stockage (`>` au lieu de `>=`) ; commentaire « fail fast » inexact dans `bullmq.ts` ; pas d'écouteurs d'erreur sur Workers/Queues ; le heartbeat ne prouve que la boucle d'événements ; rejet de `startWorker` non géré et fuite de connexion ; `DATABASE_URL` compose non encodée ; image runtime avec next/react (à réduire) et image de base sans digest ; `infra:up` construit le worker ; le test d'intégration laisse des clés dans Redis.
- **Tâche 7** : `limit` accepte `1e2`, `+5`, `0x10` ; pas de plafond de longueur sur le curseur ; `If-Match: *` ou listes → 409 (à commenter) ; `toAppError` peut lever sur un chemin Zod symbole ; mise en place de `withApi` hors `try` ; corps JSON invalide → 500 avec fragment journalisé ; lacunes de tests (Error avec status/code, throws non-Error, identifiant avec retour ligne final, `Set-Cookie` à la ré-emballe).
- **Tâche 8** : garde sur le statut (100-599) ; type du corps non contraint ; un réclamateur concurrent peut renvoyer 409 au lieu du rejeu ; test UTC dépendant de l'environnement (épingler `TZ`) ; TTL comparé entre horloge applicative et `createdAt` base ; `createDb` ignore les paramètres d'URL ; test 422 faible, pas de test « pending avec hash différent » ; `prisma` devDependency vs `migrate deploy` en production ; `verify` lançait `db:generate` deux fois ; `boundaries` et `build` n'enchaînent pas `db:generate` de la même façon.
- **Tâche 9** : pool DB possiblement persistant après timeout du check ; `err` complet journalisé (le message d'une URL mal formée peut contenir l'URL brute) ; `withApi` journalise un `AppError` 503 comme erreur non gérée avec pile ; test santé faible (mocks) ; 401 sans `WWW-Authenticate: Bearer` ; index signature de `RouteDoc` laisse passer des fautes de frappe ; `READY_TOKEN=change-me` accepté en production ; `openapi:check` compare des octets (CRLF).
- **Tâche 10** : le matcher de `proxy.ts` rate `/api-docs`, `/apis`, `/_nextfoo` (utiliser `api(?:/|$)`) ; test des chiffres arabes ne peut pas échouer ; logique de repli dupliquée (`getMessage` vs `messagesFor`, ce dernier non testé) ; `/FR/x` → `/fr/FR/x` 404 (sensible à la casse) ; une traduction `""` compte comme présente ; `formatDate` lève `RangeError` sur un fuseau invalide ; next-intl ajoute environ 450 lignes au lockfile ; composants clients à fournir un provider plus tard.
- **Tâche 11** : contraste testé seulement noir/blanc ; parseur de tokens non borné au premier `:root` ; seuls primary/bg/text figés ; règle `body` hors `@layer` ; entrées `@theme inline` de même nom : risque latent ; rangée de puces « Dressing » défilante sans affordance ; cartes radio « tenue du jour » à reprendre en vrai groupe ARIA ; textes de 11 à 13 px ; `--hairline` et `--backdrop` propres aux maquettes ; glyphe fil d'Ariane non inversé ; table de tokens de l'index incomplète ; scan limité à `.ts/.tsx/.css/.html` ; `textAlign` en template-literal non détecté ; sur-détection `left-` sur des composés. Maquettes avec prix, dates et texte inventés.
- **Tâche 12** : clic sur le bouton fermer et `min-w-11` non testés ; test StatusBadge limité au ton `warning` ; Dialog sans `max-h`/`overflow-y-auto` ni z-index ; type `StateProps` dupliqué ; `aria-busy` de `LoadingState` à retirer par le consommateur ; style désactivé du Button limité à l'opacité ; pas d'utilitaire de fusion de classes.
- **Tâche 13** : `MonthCalendar` sans validation (mois 0/13, années 0-99, `weekStartsOn` seulement typé) ; 7 colonnes demandent environ 336 px ; clé `dev.ui.dialog.title` inutilisée ; apostrophes incohérentes dans `fr.json` ; `error.tsx` embarque tous les JSON de messages côté client ; `<main>` possiblement imbriqués ; tests du calendrier non exécutés hors UTC ; glyphe `->` non inversé (dev seulement).
- **Tâche 14** : pas de test unitaire de non-régression du refocus du Dialog (couvert par e2e) ; cas limites de l'ouvreur du Dialog ; axe seulement dialogue fermé ; `open()` attend le `h1` (SSR) et non l'hydratation ; sélecteurs dépendant de `article` et `getByRole(table)` ; `playwright.config.ts` lit `.env.example` par chemin relatif ; Next charge encore `.env`/`.env.local` du développeur ; pas de `generateMetadata` localisé hors pages dev (la règle axe `document-title` signalera les futures pages) ; ordre des imports cosmétique.
- **Tâche 15** : le test de scan laisse un dossier temporaire avec la fausse clé et n'asserte pas l'identifiant de règle ; `accepts_env_example` n'asserte que le code de sortie ; `secrets:scan` avec ensemble vide non prouvé en échec ; le Dockerfile ne copie pas `public/` s'il est ajouté ; `standalone` fait avertir `next start` ; les services `web`/`worker` utilisent des placeholders (à surcharger en production) ; `openapi:check` s'exécute en pratique deux fois dans `verify` ; `test:int` contre une pile `stack:up` n'a pas de ports hôte ; préflight : `nc` absent traité comme ports libres ; teardown non fatal ; ports 3307/6380 codés en dur alors que compose lit `DB_HOST_PORT`/`REDIS_HOST_PORT` ; nettoyage du reliquat `down -v` à chaque `verify` (1 à 2 s).

## Risques restants et blocages (spec §10)

1. **Hébergement du code et CI** : le dépôt git est local, sans remote ; aucun workflow de CI n'existe (T09 partiel). Dépend du choix de l'hébergement.
2. **Documents produit absents** : registre des décisions, règles métier, ADR, modèle de données, contrats API, critères d'acceptation cités par les plans n'existent pas ; les plans sont la seule source. Recréer ou non `docs/` : décision du propriétaire.
3. **ADR-01 (actifs vs simultanés), ADR-09 (dimensionnement), ADR-10 (fournisseurs)** : ouverts, non approuvés ; aucune dépense engagée (voir le runbook, section 8).
4. **Six statuts de vêtement** : le plan 02 les évoque (spec §6) mais aucun plan ne les énumère ; `StatusBadge` expose cinq tons génériques (success, warning, info...) en attendant la liste exacte. À fournir avant la phase 04.
5. **Versions à revérifier** : pins datés du 2026-10-28 ; Prisma 8 en release candidate, Node 26 devenu LTS selon le calendrier mais non supporté par la doc Prisma, TypeScript 7 incompatible avec typescript-eslint 8.72.1 ; lignes « registre/doc seulement » de la matrice (Node 24.22.1, Redis 8, BullMQ, dependency-cruiser).
6. **Secrets et jetons de production** : `.env.example` ne contient que des `change-me` ; `READY_TOKEN` et mots de passe de la pile `app` sont des placeholders (à remplacer et injecter hors dépôt) ; aucune stratégie de gestion/rotation décidée.
7. **Migrations en production** : `prisma` est une devDependency ; une étape dédiée de `migrate deploy` reste à concevoir.
8. **Constats mineurs reportés** (section précédente), en particulier la règle de frontières pour `src/app`, `src/ui` et `src/platform` avant le premier module de la phase 03.

## Validation CP-02 requise du propriétaire avant la phase 03

**Validation CP-02 requise du propriétaire avant la phase 03.**

Rien n'est coché au nom du propriétaire. À ce jour il a approuvé en conversation la direction de design B · Studio, les maquettes et la matrice de compatibilité. Les checkpoints CP-01 et CP-02 ne sont pas signés.

- [ ] CP-01 validé par le propriétaire
- [ ] CP-02 validé par le propriétaire (critères 1 à 5 ci-dessus, risques et `NOT RUN` acceptés ou à traiter)

Aucun travail de la phase 03 ne démarre sans cette validation.
