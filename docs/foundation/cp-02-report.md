# Rapport CP-02 — Phase 02 (socle technique et design system)

| | |
|---|---|
| Phase | 02 — socle technique, monolithe modulaire, design system |
| Date des exécutions | 2026-10-28, preuves rejouées après la revue finale entre 17:45 et 17:50 (heure locale CET) |
| Branche | `phase-02-foundation` (locale, aucun remote, aucun push) |
| HEAD au moment des exécutions | `53b65b6` (`build: pin docker base image to node 24.22.1`), obtenu par `git rev-parse --short HEAD` après le dernier commit de code de la vague de corrections ; le commit de documentation (spec, README, ce rapport) vient juste après |
| Arbre de travail pendant les exécutions | deux fichiers de documentation modifiés et non encore committés (`README.md`, spec : correction M-1), aucun fichier de code |
| Environnement | macOS, Docker 28.3.3 / Compose 2.39.1, Node hôte **v24.11.1** (le pin est 24.22.1 ; les images Docker `worker` et `web` tournent désormais sur **v24.22.1**, vérifié par `docker run --rm --entrypoint node lookiva-web:latest --version` → `v24.22.1`, idem `lookiva-worker`), pnpm 12.15.0 via `packageManager` (sorties réelles : `node --version` → `v24.11.1`, `pnpm --version` → `12.15.0`) ; `corepack enable` et une installation depuis un clone vierge n'ont **pas** été exécutés (`NOT RUN`) |
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
| `pnpm boundaries` (dans `verify`) | exit 0 | `✔ no dependency violations found (86 modules, 136 dependencies cruised)` |
| `pnpm infra:up` + `pnpm test:int` (dans `verify`, projet `lookiva-verify`) | exit 0, 14 s | `Applying migration 20261028150000_init_idempotency`, `Test Files 3 passed (3)`, `Tests 15 passed (15)` |
| `pnpm stack:up` (pile complète en conteneurs, images reconstruites sur `node:24.22.1-slim`) | quatre conteneurs `Healthy` (`--wait` revenu) ; le code de sortie n'a pas été relevé explicitement dans cette exécution | voir sortie ci-dessous |
| `pnpm dev` lancé à la main | `NOT RUN` dans cette session ; `next dev` est exercé par `pnpm test:e2e` (21 tests passés) | — |
| Module métier réel | Aucun n'existe (hors périmètre phase 02) ; les règles de frontières sont testées sur des fixtures | `tests/boundaries` |

### `pnpm stack:up` et matrice curl

```
$ pnpm stack:up
 Container lookiva-redis-1  Healthy
 Container lookiva-db-1  Healthy
 Container lookiva-worker-1  Healthy
 Container lookiva-web-1  Healthy

$ docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}'
NAMES                                    IMAGE                           PORTS                      STATUS
lookiva-web-1                            lookiva-web                     127.0.0.1:3000->3000/tcp   Up 5 seconds (healthy)
lookiva-worker-1                         lookiva-worker                                             Up 5 seconds (healthy)
lookiva-redis-1                          redis:8.10.3                    6379/tcp                   Up 11 seconds (healthy)
lookiva-db-1                             mariadb:11.8.9                  3306/tcp                   Up 11 seconds (healthy)
buildx_buildkit_multiplatform-builder0   moby/buildkit:buildx-stable-1                              Up 2 hours
```

(Le conteneur `buildx_buildkit_multiplatform-builder0` tournait déjà avant la session et n'appartient pas à Lookiva.)

| Requête | Attendu | Obtenu |
|---|---|---|
| `GET http://127.0.0.1:3000/api/v1/health` | 200 | `HTTP 200` `{"status":"ok"}` ; en-tête `x-request-id: 01a18367-e445-72a3-8002-5e79286f98cc`, `content-type: application/json` |
| `GET /api/v1/ready` sans jeton | 401 | `HTTP 401` `{"type":"urn:lookiva:problem:UNAUTHORIZED","title":"Unauthorized","status":401,"code":"UNAUTHORIZED","detail":"Authentication required","requestId":"01a18367-e4cb-..."}` |
| `GET /api/v1/ready` avec `Authorization: Bearer change-me` | 200 | `HTTP 200` `{"status":"ok","checks":{"db":"ok","redis":"ok"}}` |
| `GET /fr` | `lang="fr" dir="ltr"` | `<html lang="fr" dir="ltr">` |
| `GET /ar` | `lang="ar" dir="rtl"` | `<html lang="ar" dir="rtl">` |
| `GET /de/x` | 307 | `HTTP/1.1 307 Temporary Redirect`, `location: /fr/x` |
| `GET /fr/dev/ui` (build de production) | 404 | `HTTP 404` |

Limites : la requête `/ready` avec jeton prouve la jonction web → db et web → redis dans le réseau compose ; les tables ne sont pas migrées dans cette pile.

## Critère 2 — Design system et maquettes approuvés

| Commande/test | Résultat | Preuve |
|---|---|---|
| Direction **B · Studio** choisie (spec §3) | Approuvée par le propriétaire en conversation le 2026-10-28 ; également consignée comme décision actée dans la spec §3 (spec dont le statut est maintenant « Implémenté ... validation CP-02 par le propriétaire EN ATTENTE ») | note du ledger : « USER GATE PASSED: user approved the mockups (docs/design/mockups) » ; aucune trace écrite dans le dépôt en dehors de ce rapport |
| Maquettes `docs/design/mockups/` (index, dressing, dressing-ar, fiche-vetement, recherche, tenue-du-jour) | Approuvées en conversation après la tâche 11 | commits `03b7e6b`, `2102bf3` |
| Matrice de compatibilité | Validée en conversation (gate de la tâche 1) | commits `5d3a3d7`, `0f4d2e4` |
| Tests UI (`pnpm test`, dans `verify`) : contrastes, CSS physique interdit, composants (Dialog, TextField...), galerie, calendrier, page dev | 25 fichiers, 106 tests passés (tous les tests unitaires) | sortie de `verify` ci-dessous |
| Playwright + axe sur `/{fr,en,ar}/dev/ui` (wcag2a, wcag2aa, wcag21a/aa, wcag22aa) | 0 violation, clavier (Tab, Escape), RTL, pas de défilement horizontal à 375 px (et 360 px exploratoire) | 21 passés, 3 ignorés |
| Validation **formelle** CP-02 par le propriétaire | **EN ATTENTE** | dernière section |

## Critère 3 — `verify` vert en environnement isolé

Commande : `rm -rf src/generated .next dist` puis `pnpm verify` (lancé à 17:45:01, terminé à 17:45:49, `time -p` : `real 47.16`, exit **0**). Le projet compose utilisé est `lookiva-verify`, distinct du projet de développement `lookiva`. Les ports 3000, 3100, 3307 et 6380 étaient libres avant le lancement.

```
$ rm -rf src/generated .next dist && pnpm verify
== STEP: preflight (leftover project, ports)      -- OK (0s)
== STEP: db:generate                              -- OK (0s)
== STEP: lint                                     -- OK (3s)
== STEP: typecheck                                -- OK (3s)
== STEP: boundaries
✔ no dependency violations found (86 modules, 136 dependencies cruised)
                                                  -- OK (1s)
== STEP: unit tests
 Test Files  25 passed (25)
      Tests  106 passed (106)
                                                  -- OK (3s)
== STEP: integration tests (infra up/down)
 Test Files  3 passed (3)
      Tests  15 passed (15)
                                                  -- OK (14s)
== STEP: openapi:check
openapi.json is up to date.                       -- OK (0s)
== STEP: build                                    -- OK (7s)
== STEP: e2e install (chromium)                   -- OK (0s)
== STEP: e2e smoke (playwright)
  3 skipped
  21 passed (12.5s)                               -- OK (13s)
== STEP: secret scan                              -- OK (1s)

================================================================
== verify: ALL STEPS PASSED (47s)
================================================================
real 47.16
VERIFY_EXIT=0
```

Notes : le clone n'était pas neuf (dépendances installées, image Chromium et couches Docker en cache), d'où la durée courte ; seuls `src/generated`, `.next` et `dist` ont été supprimés. Les 3 tests ignorés sont `no_horizontal_scroll_on_mobile` sur les projets desktop (voulu : projet mobile seulement). L'exécution a eu lieu sur Node hôte 24.11.1 : le pin 24.22.1 n'a pas été exercé par `verify` (il l'est seulement dans les images Docker). Les e2e tournent sur `next dev` : `src/instrumentation.ts` y est donc chargé avec un environnement valide (variables de `.env.example`) sans régression.

### Démarrage web : validation de l'environnement (correction I-2)

Preuves exécutées dans cette session (aucune valeur réelle ; les « secrets » ci-dessous sont des chaînes factices) :

1. Image de production, `READY_TOKEN` non défini (les autres variables fournies, dont un mot de passe factice dans `DATABASE_URL`) :

```
$ docker run --rm -e DATABASE_URL='<url mysql avec mot de passe factice SUPERSECRETPW>' -e REDIS_URL='redis://redis:6379' lookiva-web:latest
▲ Next.js 16.4.3
- Local:         http://localhost:3000
- Network:       http://0.0.0.0:3000
✓ Ready in 0ms
✓ Running next.config took 0.8ms
Invalid environment: READY_TOKEN (invalid_type)
EXIT=1          (occurrences de SUPERSECRETPW dans la sortie : 0)
```

(La commande réelle utilisait une URL `mysql://lookiva:<mot de passe factice>@db:3306/lookiva` ; elle est abrégée ici car `secrets:scan` signale à juste titre toute chaîne de connexion MySQL avec mot de passe.)

2. Serveur standalone local (`.next/standalone/server.js`, environnement vidé par `env -i`), deux cas : `READY_TOKEN` absent → `Invalid environment: READY_TOKEN (invalid_type)`, exit 1 ; `DATABASE_URL='not-a-url-TOPSECRETPW'` → `Invalid environment: DATABASE_URL (invalid_format)`, exit 1 ; 0 occurrence de la valeur dans la sortie. Avec un environnement valide, le même serveur reste en ligne et `GET /api/v1/health` répond `HTTP/1.1 200 OK`.
3. Constat important sur Next 16.4.3 : un `register()` qui lève est seulement journalisé (« Failed to prepare server ») et le serveur **continue de tourner** en répondant une 500 non `problem+json` à chaque requête. Pour obtenir un vrai arrêt immédiat, `src/instrumentation.node.ts` journalise le message `EnvError` (sans valeur) et appelle `process.exit(1)` quand `NODE_ENV=production` ; hors production, l'erreur est relancée. Le code Node est dans un fichier séparé importé dynamiquement pour que le bundle edge ne contienne pas `process.exit` (un premier essai en un seul fichier produisait l'avertissement Turbopack « A Node.js API is used (process.exit) which is not supported in the Edge Runtime »).
4. `next build` sans aucune variable d'environnement : réussi (`register()` est sans effet pendant `phase-production-build`), `instrumentation.js` présent dans `.next/standalone/.next/server`.
5. Robustesse de `withApi` (test `bad_env_still_yields_problem_json_500_with_request_id`) : avec un environnement invalide et sans logger injecté, la réponse reste une 500 `application/problem+json` avec `X-Request-Id`, sans valeur d'environnement.

`NOT RUN` pour ce point : comportement de `next dev` lancé à la main avec un environnement invalide ; comportement du healthcheck Docker et de `stack:up --wait` avec une image démarrée sur un environnement invalide (le conteneur sort en code 1, ce qui est prouvé, mais le redémarrage compose n'a pas été observé).

## Critère 4 — DB et Redis non exposés

| Commande/test | Résultat | Preuve |
|---|---|---|
| `tests/infra/compose.test.ts` (dans `pnpm test`) : aucun port publié sur db/redis dans `compose.yaml`, ports de l'overlay en loopback | passé | 106 tests unitaires passés |
| `docker ps` pendant `stack:up` | db `3306/tcp`, redis `6379/tcp` : **non publiés** ; web `127.0.0.1:3000->3000/tcp` | sortie ci-dessus |
| `docker inspect` pendant `stack:up` | `lookiva-db-1 {"3306/tcp":null}`, `lookiva-redis-1 {"6379/tcp":null}`, `lookiva-worker-1 {}`, `lookiva-web-1 {"3000/tcp":[{"HostIp":"127.0.0.1","HostPort":"3000"}]}` | |
| `nc -z 127.0.0.1 <port>` pendant `stack:up` | `3307 closed`, `6380 closed`, `3306 closed`, `6379 closed` ; `3000 OPEN` (web) ; `lsof` : seul `127.0.0.1:3000 (LISTEN)` | |
| `nc -z <IP LAN de la machine> 3000` | `closed` (web lié à loopback) | |

Précision : les ports hôte `127.0.0.1:3307` (MariaDB) et `127.0.0.1:6380` (Redis) existent seulement quand l'overlay `compose.test.yaml` est utilisé (`pnpm infra:up`, `pnpm verify`) pour que les tests tournent depuis l'hôte ; ils sont liés à loopback. La preuve « fermé » ci-dessus porte sur la pile `stack:up`, qui n'utilise pas l'overlay. L'accessibilité de db/redis à travers un réseau réel (autre machine) est `NOT RUN`.

## Critère 5 — Aucun secret committé

| Commande/test | Résultat | Preuve |
|---|---|---|
| `pnpm secrets:scan` (`secretlint "**/*"`, préréglage recommended + règle AWS avec `enableIDScanRule`), relancé après les corrections de la revue finale | exit 0, aucune détection | `$ secretlint "**/*"` puis `EXIT=0` |
| `tests/verify/secret-scan.test.ts` : une clé factice fait échouer le scan, `.env.example` le passe | passé (dans les 106 tests) | |
| `git ls-files \| grep -E "\.env"` | seul `.env.example` est suivi ; `.env` et `.env.*` sont ignorés | `git check-ignore -v .env` → `.gitignore:7` |
| `git ls-files .superpowers` | 0 fichier (dossier ignoré) | |
| Valeurs dans `.env.example` | placeholders `change-me` uniquement | `.env.example` |
| Scan de l'historique git complet (26 commits) | `NOT RUN` | — |

Limites : `secretlint` respecte `.gitignore` et `.secretlintignore`, qui compte 8 entrées (`node_modules`, `.next`, `dist`, `src/generated`, `.superpowers`, `playwright-report`, `test-results`, `pnpm-lock.yaml`). `.env.example` n'est **pas** ignoré : il est scanné et passe grâce au motif `allows` du placeholder `change-me` de `.secretlintrc.json`, qui compte deux motifs étroits (placeholder `change-me` et une chaîne de test exacte). `enableIDScanRule: true` est nécessaire sur la règle AWS car le préréglage recommended ne signale pas les identifiants de clé d'accès AWS par défaut (sans l'option, une clé factice sortait en code 0, voir la matrice de compatibilité).

## État git

```
$ git rev-parse --short HEAD
53b65b6

$ git log --oneline        (avant le commit de documentation qui contient ce rapport)
53b65b6 build: pin docker base image to node 24.22.1
73b3de6 fix: validate env at web startup and keep withApi alive on bad env
d1d601f fix: read json bodies safely and never log parser messages
125268f docs: correct secret scan description and evidence references in CP-02 report
739644c docs: readme, local runbook and CP-02 report
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

$ git status --short        (au moment des preuves, avant le commit de documentation)
 M README.md
 M docs/superpowers/specs/2026-10-28-phase-02-foundation-design.md
```

### Arrêt de la pile

```
$ pnpm stack:down
 Container lookiva-db-1 / redis-1  Stopped, Removed   (web et worker déjà retirés)
 Volume lookiva_db-data  Removed
 Network lookiva_internal  Removed
$ docker ps       → seul buildx_buildkit_multiplatform-builder0 (préexistant, hors projet)
$ docker volume ls | grep lookiva; docker network ls | grep lookiva   → vide
$ nc -z 127.0.0.1 {3000,3100,3307,6380}   → tous closed
```

Le code de sortie de `stack:down` n'a pas été relevé explicitement ; l'état final (aucun conteneur, volume, réseau ni port ouvert) a été vérifié.

## Couverture du plan 02 (T01..T12)

Les identifiants T01..T12 sont ceux de `plans/02-foundation-design-system-plan.md`. Les « Task n » du plan d'implémentation (`docs/superpowers/plans/`) sont entre parenthèses.

| Plan 02 | Livraison | Commits | Statut |
|---|---|---|---|
| T01 topologie, frontières | `.dependency-cruiser.cjs` (4 règles), `pnpm boundaries`, tests sur fixtures ; documenté par le README de T12 (ce commit) | `c087ebf` | Partially : règles appliquées et testées, mais aucun module réel (voulu) ; la règle app/ui/platform → internes d'un module est à ajouter avant la phase 03 |
| T02 versions et POC Prisma + MariaDB | `docs/foundation/compat-matrix.md`, pins exacts dans `package.json` (Tasks 1-2) | `5d3a3d7`, `0f4d2e4`, `6925736` | Done. Matrice validée par le propriétaire en conversation. POC sur Node 24.11.1 / pnpm 11.22.0, lignes « registre/doc seulement » pour Node 24.22.1, Redis 8, BullMQ |
| T03 validation, erreurs, pagination, IDs, ETag, idempotence, OpenAPI | `src/platform/http/*` (dont `readJson` dans `body.ts`), `src/platform/openapi`, `prisma/` (Tasks 7, 8, 9) | `17dc427`, `1b007ce`, `2c533ee`, `9081a5c`, `d1d601f` | Done ; les lacunes d'idempotence (I-5) sont reportées en phase 03 |
| T04 Docker local DB/Redis/worker | `compose.yaml`, `compose.test.yaml`, `Dockerfile` (image de base épinglée sur `node:24.22.1-slim`), profil `app`, `tests/infra/compose.test.ts` (Tasks 3, 6, 15) | `8ea4467`, `e8475ba`, `34ceb2c`, `9edd0b9`, `53b65b6` | Done |
| T05 squelette modules et abstractions providers | ports + fakes `src/platform/{db,storage,weather,email,embeddings,ai,clock,queue,audit}`, queue BullMQ, worker (Task 6) | `e8475ba` | Partially : ports et adapters présents, aucun adapter réel (hors périmètre) ; le répertoire `src/modules/` n'existe pas encore |
| T06 App Router localisé, RTL, repli FR | `src/proxy.ts`, `src/i18n/*`, `src/app/[locale]/layout.tsx` (Task 10) | `0f258d3`, `bda49a2` | Done. Rendu arabe réel sur appareil `NOT RUN` |
| T07 directions de design, tokens, maquettes | `src/ui/tokens.css`, `src/ui/contrast.ts`, `docs/design/mockups/` (Task 11) | `03b7e6b`, `2102bf3` | Done. Direction B choisie et maquettes approuvées en conversation (pas de signature écrite) |
| T08 composants accessibles | Button, TextField, Dialog, Gallery, GarmentCard, OutfitCard, MonthCalendar, StatusBadge, états vide/chargement/erreur (Tasks 12, 13) | `d6a8dfa`, `2c2e9a4`, `bda49a2` | Done pour les composants listés ; audit manuel clavier/zoom/lecteur d'écran `NOT RUN` |
| T09 pipeline CI | `scripts/verify.sh` (`pnpm verify`) (Task 15) | `34ceb2c`, `9edd0b9` | Partially : commande unique `verify` seulement ; **aucun workflow de CI** car l'hébergement du code n'est pas choisi ; aucun déploiement automatique |
| T10 observabilité, health/readiness, redaction, secrets, env de test | logger pino avec redaction (Task 5), `/health` `/ready` (Task 9), secretlint (Task 15), `.env.example` + validation Zod (web via `src/instrumentation.ts`) | `5602161`, `9081a5c`, `34ceb2c`, `73b3de6` | Partially : socle local fait ; sérialiseur d'erreurs du logger non fait (I-3, reporté) ; pas de plan de gestion des secrets de production ni de métriques (phase 12) |
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
- Node 24.22.1 (pin) sur l'hôte : `NOT RUN` ; `verify` et les tests ont tourné sur Node hôte 24.11.1. Seules les images Docker utilisent 24.22.1 (tag `node:24.22.1-slim`, version relevée dans les images) ; `pnpm verify` n'a pas été exécuté sur cette version.
- `pnpm install` depuis un clone vierge sans cache et sans corepack préinstallé : `NOT RUN` (dépendances déjà installées).
- `pnpm dev` à la main : `NOT RUN` (`next dev` couvert par Playwright).
- Scan de secrets de l'historique git : `NOT RUN`.
- Comportement de `next dev` lancé à la main avec un environnement invalide, et redémarrage compose / healthcheck face à un conteneur `web` qui sort en code 1 : `NOT RUN` (voir « Démarrage web : validation de l'environnement »).
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
Final review: Ruling: fix before CP-02 ONLY I-1 (readJson helper: malformed JSON body leaked into logs), I-2 (env validated at web startup + withApi logger inside try), M-1 (stale spec header + README conventions) and M-2 (Dockerfile NODE_VERSION pin 24.22.1) — they are a secret-in-logs path, a false doc claim, misleading docs and a floating image tag — cost if wrong: none, all small and doc/platform-only
Final review: Ruling: I-3 (err serializer), I-4 (boundary holes + OwnerId relocation to a shared kernel) and I-5 (idempotency helpers) are carried as the FIRST Phase 03 task instead of fixed now — no module code exists to exploit them, and boundary/kernel restructuring belongs with the first module — cost if wrong: Phase 03 must start with them (documented as blocking in the CP-02 report; I-4 blocks the first module)
Final review: Ruling: all other deferred minors are triaged per final-review.md (EARLY PHASE 03 or ACCEPT) and listed in the CP-02 report; none block CP-02 — cost if wrong: small test/hardening debts accumulate if the Phase 03 start skips the verify-hardening commit
Final review: ONE fix dispatch sent (fresh implementer) for I-1, I-2, M-1, M-2 + CP-02 report update
```

## Revue finale de la branche

Revue de toute la branche par le reviewer opus, plage `361a0e4..125268f`. **Verdict : « Ready to merge: With fixes », 0 Critical.** Points forts relevés : dépendances toutes épinglées exactement ; aucun secret, CI ni module ; noyau HTTP solide (un seul convertisseur d'erreurs, identifiant de requête assaini, curseur invalide → 400, `/ready` en temps constant) ; idempotence bien conçue ; `verify` isolé dans son propre projet compose ; pas de redirection ouverte ; vrai travail d'accessibilité et de RTL ; documentation honnête.

### Corrigé dans la vague de corrections (quatre éléments)

| # | Constat | Correction | Commit |
|---|---|---|---|
| I-1 (Important) | Un corps JSON invalide faisait lever à `Request.json()` une `SyntaxError` dont le message cite un fragment du corps (mot de passe possible) ; `withApi` journalisait `{ err }` et la redaction pino ne se base que sur des chemins. | `readJson(req, schema)` dans `src/platform/http/body.ts` : toute erreur de lecture ou d'analyse devient `AppError('INVALID_JSON', 400, 'Malformed JSON body')` sans message du parseur ni `cause` ; une violation de schéma reste une 400 `VALIDATION_ERROR`. Runbook §6 et README mis à jour. Tests : `body.test.ts` (4) et `malformed_json_body_never_reaches_logs`. | `d1d601f` |
| I-2 (Important) | L'application web ne validait pas l'environnement au démarrage (contrairement au worker, au runbook et à la spec §8) ; avec un environnement invalide, même `/api/v1/health` sortait de `withApi` en 500 Next non `problem+json`. | `src/instrumentation.ts` (`register()`, Node uniquement, sans effet pendant le build) et `src/instrumentation.node.ts` (en production : message `EnvError` sans valeur puis `process.exit(1)`, car Next 16.4.3 se contente sinon de journaliser l'échec et continue de répondre 500) ; création du logger par défaut de `withApi` protégée avec repli sur `createLogger()`. Tests : `instrumentation.test.ts` (5) et `bad_env_still_yields_problem_json_500_with_request_id`. Preuve de démarrage en échec rapide : section du critère 3. | `73b3de6` |
| M-1 (doc) | En-tête de la spec encore « BROUILLON À RELIRE (aucun code écrit) » et §2 « pas de dépôt git ». README sans les conventions de la spec §5. | Statut de la spec : « Implémenté (Tasks 1–16, branche `phase-02-foundation`) — validation CP-02 par le propriétaire EN ATTENTE » ; §2 marqué « constat avant la phase (snapshot du 2026-10-28) » sans autre changement ; deux lignes ajoutées aux conventions du README (pas de push ni de suppression d'objet dans une transaction SQL ; SQL brut seulement dans `infrastructure`, toujours paramétré). Aucune approbation du propriétaire n'est affirmée en plus de ce que ce rapport dit déjà. | commit de documentation qui contient ce rapport |
| M-2 (pin) | `ARG NODE_VERSION=24` flottait dans le `Dockerfile`. | `ARG NODE_VERSION=24.22.1` (tag `node:24.22.1-slim`, présence vérifiée par `docker manifest inspect node:24.22.1-slim`) ; `docker compose --env-file .env.example --profile app build` réussi, `node --version` → `v24.22.1` dans les images `web` et `worker`. | `53b65b6` |

### Reportés en phase 03

Les trois premiers sont des éléments **Important** : ils forment la **première tâche de la phase 03**, et **I-4 bloque le premier module**.

- **I-3 (Important, début de phase 03)** : la redaction des logs ne couvre pas les objets d'erreur (le sérialiseur `err` de pino imprime message, pile et champs énumérables ; `*.x` ne couvre qu'un niveau). Les erreurs de validation Prisma impriment les arguments de requête (adresses e-mail, empreintes) ; les erreurs de pilote peuvent porter `input`. À faire : sérialiseur `err` personnalisé (erreurs Prisma : nom, code, méta seulement ; retirer `input` ; plafonner le message), journaliser les erreurs non-`AppError` au niveau error et les `AppError` ≥ 500 en warn sans pile (ce qui retire aussi le bruit « unhandled error » sur un 503 `NOT_READY`). Fichiers : `src/platform/logger.ts`, `src/platform/http/with-api.ts`, `src/platform/health/ready.ts`.
- **I-4 (Important, début de phase 03, bloque le premier module)** : trous dans les frontières. `module-public-only` ne contraint que les fichiers dans `src/modules` : `src/app`, `src/platform` et `src/worker` peuvent importer `modules/x/application|domain|infrastructure` ; et `domain-pure` interdit tout import `src/` hors du domaine du module (imports de types compris), donc `OwnerId`, `OwnerScopedRepository` et `Page` de `src/platform/http/owner-scope.ts` sont inaccessibles depuis un port de domaine. À faire avant le premier module : déplacer ces types dans un noyau partagé (par exemple `src/platform/kernel/`) autorisé depuis le domaine ; règle n'autorisant que `src/modules/<m>/index.ts` depuis `^src/(app|ui|platform|worker)/` ; interdire `src/platform → src/modules` ; fixtures utilisant l'alias `@/` ; asserter que le cas « autorisé » traverse plus de zéro dépendance.
- **I-5 (Important, début de phase 03)** : lacunes de `withIdempotency`. `onPersistError` optionnel (perte silencieuse par défaut : le rendre obligatoire ou prendre un `Logger`) ; `userId` est une chaîne simple et non un `OwnerId` ; pas de validation de `Idempotency-Key` (dépassement de `VARCHAR(255)` → P2000 → 500) : fournir un helper qui lit et valide l'en-tête (`^[A-Za-z0-9_-]{8,128}$`) et calcule `requestHash` (SHA-256 de méthode, chemin et corps canonique) ; `T` non contraint (le restreindre à `Prisma.InputJsonValue`) ; pas de purge TTL des enregistrements terminés (par exemple 24 h).
- **Autres éléments (condensé)** :
  - M-3 : pas de `generateMetadata` ni de titre sur `[locale]/layout.tsx` (WCAG 2.4.2). M-4 : pas de `global-error.tsx` ni de `not-found.tsx` localisé. M-5 : câblage et matcher du proxy non testés de bout en bout (e2e `/dressing` → `/fr/dressing`, puis smoke sur le serveur standalone). M-6 : les tests d'intégration respectent un `DATABASE_URL`/`REDIS_URL` déjà exportés (les exporter explicitement dans `verify.sh`). M-7 : `infra:down`/`stack:down` font toujours `down -v` sur le projet `lookiva` du développeur (garder `-v` seulement dans `*:reset` et `verify`). M-8 : Workers BullMQ sans écouteur `'error'`. M-9 : Dialog sans `max-h`/`overflow-y-auto`/z-index, pas d'assertion de reflow à 320 px (calendrier ~336 px). M-10 : pas de convention ni d'utilitaire pour inverser les icônes directionnelles en RTL. M-11 : `open()` des e2e attend le `h1` SSR et non l'hydratation ; axe seulement dialogue fermé. M-12 (ACCEPTÉ) : le worker reçoit `READY_TOKEN`/`DATABASE_URL` qu'il n'utilise pas (scinder le schéma d'env en phase 12).
  - Autres éléments tôt en phase 03 : vérification de schéma `z.url()` pour `DATABASE_URL`/`REDIS_URL` ; décision sur `If-Match: *` et commentaire ; test `Set-Cookie` conservé par la ré-emballe de `withApi` ; garde de statut 100-599 et contrôle du type du corps dans l'idempotence ; `createDb` ignore les paramètres de requête de l'URL (TLS) et ne vérifie pas le schéma ; `prisma` devDependency face à `migrate deploy` en production ; délai de connexion/acquisition du pool DB inférieur à 2500 ms pour `/ready` ; `READY_TOKEN` placeholder refusé et longueur minimale 32 en production ; frontière du matcher du proxy (`api(?:/|$)`) et routes de métadonnées ; test de repli de `messagesFor` et fournisseur next-intl client (`error.tsx` embarque tous les catalogues) ; parseur de tokens limité au premier bloc `:root` ; copie de `public/` dans le Dockerfile quand les ressources PWA arriveront ; image worker alourdie (next/react via `--prod`).
  - Hors périmètre de la phase 02, non jugés par le reviewer : en-têtes de sécurité (CSP, HSTS) → phase 12 ; limitation de débit → phases 03/12 ; mot de passe / TLS Redis et secrets de production → phase 12 ; scan complet de l'historique git (`NOT RUN`) ; Node 24.22.1 sur l'hôte, appareils réels, WCAG manuel, Safari et Firefox (`NOT RUN`).

Rulings que le reviewer conteste en partie : le logger par défaut hors `try` (T5↔T7, corrigé par I-2) ; `onPersistError` optionnel (T8, I-5) ; les e2e sur `next dev`, qui font que le serveur de production et le proxy ne sont jamais exercés par `verify` (T13/T14/T15, M-5).

## Constats mineurs reportés

Issus du ledger, une ligne par tâche et par sujet, condensés. À trier à la revue finale ; aucun n'a été corrigé dans cette tâche.

- **Tâche 1** : formulation de la ligne Node (24 en Maintenance, 26 non testé mais pas non supporté) ; empreinte MariaDB tronquée ; alternatives non sourcées (React Aria, zod-openapi, create-next-app, npm/yarn) ; `VERSION()` complet et durée absents du POC ; registre npm comme source par défaut à déclarer en en-tête ; note 8 trop générale ; licence Redis 8 non mentionnée ; note 5 sans preuve isolée pour `@parcel/watcher`/`@swc/core` ; ligne TypeScript « POC + V2 » sans `tsc` dans le log.
- **Tâche 2** : `z.url()` accepte tout schéma pour `DATABASE_URL`/`REDIS_URL` ; mémoïsation de `getEnv()` non testée ni réinitialisable ; `NODE_ENV` vaut `development` par défaut ; test d'env avec try/catch sans `expect.assertions` ; `typescript-eslint` en devDependency directe non importée par la config.
- **Tâche 3** : test « pas de ports » passe si db/redis sont renommés (`?? []`) ; test loopback regroupe db et redis ; test de base ignore `expose`/`network_mode` ; commenter que le réseau `internal` n'est pas `internal: true`.
- **Tâche 4** : `module-public-only` ne contraint que les fichiers dans les modules (à compléter avant le premier vrai module, phase 03) ; cas autorisé sans preuve d'arêtes ; pas de fixture application → sa propre infrastructure ; alias `@/` non testé ; WARN peer-dependency non investigué.
- **Tâche 5** : test comportemental manquant pour `req.headers.authorization`/`cookie` ; vérification brute affaiblie pour le jeton ; la redaction `*.key` ne couvre qu'un niveau ; `logger.error({err})` n'expurge ni message ni pile.
- **Tâche 6** : expiration du faux stockage (`>` au lieu de `>=`) ; commentaire « fail fast » inexact dans `bullmq.ts` ; pas d'écouteurs d'erreur sur Workers/Queues ; le heartbeat ne prouve que la boucle d'événements ; rejet de `startWorker` non géré et fuite de connexion ; `DATABASE_URL` compose non encodée ; image runtime avec next/react (à réduire) et image de base sans digest ; `infra:up` construit le worker ; le test d'intégration laisse des clés dans Redis.
- **Tâche 7** : `limit` accepte `1e2`, `+5`, `0x10` ; pas de plafond de longueur sur le curseur ; `If-Match: *` ou listes → 409 (à commenter) ; `toAppError` peut lever sur un chemin Zod symbole ; mise en place de `withApi` hors `try` (corrigé par I-2) ; corps JSON invalide → 500 avec fragment journalisé (corrigé par I-1) ; lacunes de tests (Error avec status/code, throws non-Error, identifiant avec retour ligne final, `Set-Cookie` à la ré-emballe).
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
8. **Éléments Important reportés de la revue finale (I-3 sérialiseur d'erreurs des logs, I-4 trous de frontières et déplacement de `OwnerId` dans un noyau partagé, I-5 helpers d'idempotence)** : première tâche de la phase 03 ; I-4 bloque le premier module.
9. **Constats mineurs reportés** (section « Constats mineurs reportés » et liste « Reportés en phase 03 »).

## Validation CP-02 requise du propriétaire avant la phase 03

**Validation CP-02 requise du propriétaire avant la phase 03.**

Rien n'est coché au nom du propriétaire. À ce jour il a approuvé en conversation la direction de design B · Studio, les maquettes et la matrice de compatibilité. Les checkpoints CP-01 et CP-02 ne sont pas signés.

- [ ] CP-01 validé par le propriétaire
- [ ] CP-02 validé par le propriétaire (critères 1 à 5 ci-dessus, risques et `NOT RUN` acceptés ou à traiter)

Aucun travail de la phase 03 ne démarre sans cette validation. À la reprise, la phase 03 commence par les éléments Important reportés de la revue finale (I-3, I-4, I-5), I-4 devant être traité avant le premier module.
