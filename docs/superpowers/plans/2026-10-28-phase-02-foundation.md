# Lookiva Phase 02 — Socle technique et design system : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** Livrer un socle démarrable en local (monolithe modulaire Next.js + worker BullMQ, API `/api/v1`, i18n/RTL, design system « Studio ») prouvé par une commande unique `pnpm verify`.

**Architecture :** Un package, deux points d'entrée (app Next.js, worker). Code en `src/modules/<domaine>/{domain,application,infrastructure,api}` + `src/platform` (ports et adapters). Frontières imposées en CI. Aucun module métier en Phase 02.

**Tech Stack :** Next.js App Router, TypeScript strict, Zod, Prisma + MariaDB 11.8, Redis + BullMQ, pino, Tailwind (propriétés logiques), primitives UI accessibles, Vitest, Playwright + axe-core, dependency-cruiser, Docker Compose. **Versions exactes : celles de `docs/foundation/compat-matrix.md` (Task 1).**

**Spec :** `docs/superpowers/specs/2026-10-28-phase-02-foundation-design.md` (lire avec ce plan).

## Global Constraints

- TypeScript `strict: true` ; schémas Zod = source unique de validation et d'OpenAPI.
- MariaDB **11.8** ; SQL brut isolé dans `infrastructure`, toujours paramétré ; **aucune table vectorielle** en Phase 02.
- Identifiants **UUIDv7**, jamais d'auto-incrément exposé. Temps en UTC.
- Pagination **par curseur**. Erreurs : `type`, `title`, `status`, `code`, `detail`, `requestId`, `errors[]`, `Content-Type: application/problem+json`.
- Concurrence : colonne `version`, ETag, `If-Match` → **409** en conflit. Idempotence : `Idempotency-Key`, unicité `(userId, key)` + hash de requête.
- Chaque repository exige `ownerId` en paramètre obligatoire. Aucun push ni suppression d'objet pendant une transaction SQL.
- Tokens : primaire `#0E5C63`, fond `#F4F6F8`, texte `#14202B`. Cibles tactiles **≥ 44 px**. CSS **logique uniquement** (jamais gauche/droite). Pas de thème sombre livré, **pas de Storybook** (page `/[locale]/dev/ui`, dev uniquement).
- i18n fr/en/ar, repli sur le français, texte utilisateur jamais traduit ; chiffres latins explicites en Phase 02.
- `GET /api/v1/health` = liveness sans dépendances ; `GET /api/v1/ready` = base + Redis, protégé.
- Aucun secret committé ; `.env.example` sans valeur réelle ; variables validées par Zod au démarrage.
- **Aucun `git init`, commit ni push sans nouvel accord explicite de l'utilisateur.** Les étapes « Commit » ne s'exécutent qu'après cet accord ; sinon les ignorer et le noter dans le rapport.
- Pas de fournisseur réel ni de dépense. Aucun déploiement. Si Docker est absent ou si Prisma + MariaDB 11.8 est incompatible : **stop-the-line**, demander à l'utilisateur.
- Tout test non exécuté = `NOT RUN`, jamais `PASS`.

## Review Focus

1. Locale inconnue dans l'URL (`/de/dressing`, `/dressing`) → redirection vers `/fr/dressing`, pas de 404 ni de crash (Task 10).
2. Même `Idempotency-Key` rejouée avec un corps différent → 422 `IDEMPOTENCY_KEY_REUSED`, jamais la réponse d'origine (Task 8).
3. Curseur de pagination altéré ou non base64 → 400 `INVALID_CURSOR`, jamais 500 (Task 7).
4. Base ou Redis arrêtés → `/ready` 503 (corps d'erreur sans trace de pile), `/health` reste 200 (Task 9).
5. `X-Request-Id` entrant avec saut de ligne ou 500 caractères → remplacé par un id généré, jamais recopié dans les logs (Task 7).

## Structure des fichiers

```
docs/foundation/compat-matrix.md      versions + sources (Task 1)
docs/design/mockups/*.html            maquettes parcours prioritaires (Task 11)
compose.yaml, compose.test.yaml       db, redis, worker, web ; override de test (Tasks 3, 6, 15)
prisma/schema.prisma                  IdempotencyRecord seulement (Task 8)
src/platform/{env,logger,db}.ts       config, logs, client Prisma
src/platform/<port>/{port,fake}.ts    clock, queue(+bullmq), storage, weather, email, embeddings, ai, audit
src/platform/http/                    errors, with-api, pagination, ids, etag, owner-scope, idempotency
src/platform/openapi/                 registry, build
src/worker/index.ts                   entrypoint BullMQ
src/i18n/                             routing, config, format, messages/{fr,en,ar}.json
src/ui/                               tokens.css, contrast.ts, components/*
src/app/[locale]/…, src/app/api/v1/…  routes
tests/…, e2e/…                        Vitest, Playwright
```

---

### Task 1 : Matrice de compatibilité et POC Prisma + MariaDB (plan 02 T02)

**Files:** Create `docs/foundation/compat-matrix.md`, `poc/prisma-mariadb/poc.test.ts` (jetable, supprimé en fin de tâche).

**Interfaces:** Produces — table `composant | version exacte | URL source | date de consultation` pour : Next.js, Node LTS, Prisma (+ adapter MariaDB), image MariaDB 11.8, Redis, BullMQ, Zod, Tailwind, Vitest, Playwright, axe-core, pino, `uuid`, dependency-cruiser, secretlint, une bibliothèque OpenAPI-depuis-Zod, une bibliothèque i18n (candidat : next-intl), une bibliothèque de primitives UI (candidats : Radix UI, React Aria), gestionnaire de paquets (proposé : pnpm). Toutes les tâches suivantes consomment ces versions.

- [ ] **Step 1 :** `docker --version`, `docker compose version`, `node --version`. Si Docker manque → stop-the-line.
- [ ] **Step 2 :** Relever sur les documentations officielles la dernière version stable et sa compatibilité déclarée pour chaque ligne ci-dessus ; remplir la matrice avec URL et date réelles (rien de mémoire).
- [ ] **Step 3 :** Écrire `poc.test.ts` (Compose MariaDB 11.8 jetable), 3 tests : `connects_and_applies_migration` (migration crée `poc_item`) ; `transaction_rolls_back_on_throw` (ligne absente après exception) ; `parameterized_raw_query_returns_version` (`SELECT VERSION()` via `$queryRaw` commence par `11.8`).
- [ ] **Step 4 :** Lancer le POC. Attendu : 3 PASS. Sinon stop-the-line.
- [ ] **Step 5 :** Noter dans la matrice les choix (gestionnaire, i18n, primitives, OpenAPI), supprimer `poc/`, **demander validation de la matrice à l'utilisateur avant Task 2**.

### Task 2 : Squelette, TypeScript strict, scripts, validation d'environnement (T10/T12)

**Files:** Create `package.json`, `tsconfig.json`, `eslint.config.*`, `vitest.config.ts`, `.gitignore`, `.env.example`, `src/platform/env.ts`, `src/app/layout.tsx`, `tests/platform/env.test.ts`.

**Interfaces:** Produces — `parseEnv(raw: Record<string, string | undefined>): Env` ; `getEnv(): Env` (mémoïsé) ; `class EnvError extends Error` ; `type Env = { NODE_ENV: 'development'|'test'|'production'; DATABASE_URL: string; REDIS_URL: string; READY_TOKEN: string; LOG_LEVEL: 'debug'|'info'|'warn'|'error' }` (`LOG_LEVEL` défaut `info`). Scripts : `dev`, `build`, `lint`, `typecheck`, `test`, `test:int`, `test:e2e`, `verify`.

- [ ] **Step 1 :** Tests dans `env.test.ts` : `parseEnv({})` lève `EnvError` dont le message cite `DATABASE_URL`, `REDIS_URL`, `READY_TOKEN` ; avec `DATABASE_URL=mysql://u:s3cret@h/db` fourni et le reste manquant, le message **ne contient pas** `s3cret` ; env valide → `LOG_LEVEL === 'info'`.
- [ ] **Step 2 :** Lancer → FAIL. **Step 3 :** Implémenter `parseEnv` avec Zod (messages sans valeurs). **Step 4 :** Lancer → PASS.
- [ ] **Step 5 :** Initialiser le projet aux versions de la matrice ; `.env.example` avec clés et valeurs factices explicites (`change-me`) ; `.gitignore` exclut `.env*` sauf l'exemple. Vérifier `pnpm typecheck && pnpm lint` verts.
- [ ] **Step 6 :** Commit (si accord git) : `chore: scaffold project with strict TS and env validation`.

### Task 3 : Compose local MariaDB + Redis (T04)

**Files:** Create `compose.yaml`, `compose.test.yaml`, `tests/infra/compose.test.ts`.

**Interfaces:** Produces — services `db` (MariaDB 11.8) et `redis` avec healthchecks, réseau interne, **aucun port publié** dans `compose.yaml` ; `compose.test.yaml` publie `db` et `redis` sur `127.0.0.1` uniquement, pour les tests exécutés sur l'hôte. Commandes : `docker compose -f compose.yaml -f compose.test.yaml up -d --wait`.

- [ ] **Step 1 :** Test `compose.test.ts` (via `docker compose config --format json`) : `base_publishes_no_ports_for_db_and_redis` ; `test_override_binds_only_loopback` (tout `host_ip` vaut `127.0.0.1`) ; `db_and_redis_define_healthchecks`.
- [ ] **Step 2 :** Lancer → FAIL. **Step 3 :** Écrire les deux fichiers Compose (secrets via variables d'environnement de `.env.example`). **Step 4 :** Test → PASS, puis `up -d --wait` : les deux services `healthy`.
- [ ] **Step 5 :** Commit : `chore: add local compose for mariadb and redis`.

### Task 4 : Frontières de modules en CI (T01)

**Files:** Create `.dependency-cruiser.cjs`, `tests/boundaries/boundaries.test.ts`, `tests/boundaries/fixtures/**`. Script `pnpm boundaries`.

**Interfaces:** Produces — règles `domain-pure` (domain n'importe que domain), `no-infra-from-inner` (domain/application → infrastructure interdit), `module-public-only` (entre modules : seulement `modules/<m>/index.ts`), `ui-no-infra` (`src/app`, `src/ui` → `infrastructure` interdit).

- [ ] **Step 1 :** Fixtures : `domain` important `infrastructure` ; `modules/a` important `modules/b/infrastructure/x` ; import autorisé `modules/a` → `modules/b/index`. Tests : les deux premiers produisent chacun une violation nommée (`no-infra-from-inner`, `module-public-only`), le troisième zéro.
- [ ] **Step 2 :** Lancer → FAIL. **Step 3 :** Écrire la config. **Step 4 :** PASS ; `pnpm boundaries` vert sur `src/`.
- [ ] **Step 5 :** Commit : `chore: enforce module boundaries with dependency-cruiser`.

### Task 5 : Logger structuré avec redaction (T10)

**Files:** Create `src/platform/logger.ts`, `tests/platform/logger.test.ts`.

**Interfaces:** Produces — `createLogger(opts?: { level?: string; destination?: NodeJS.WritableStream }): Logger` (pino) ; chemins redactés : `password`, `token`, `accessToken`, `refreshToken`, `cookie`, `authorization`, `emailBody` au premier niveau **et** `*.<chemin>` ; `logger.child({ requestId })`.

- [ ] **Step 1 :** Test : journaliser `{ password: 'p4ss', token: 'tok', headers: { authorization: 'Bearer abc', cookie: 'a=b' }, emailBody: 'texte secret' }` vers un flux mémoire ; la sortie JSON ne contient aucune des valeurs brutes, contient `[REDACTED]`, et un `child({requestId:'r-1'})` ajoute `requestId`.
- [ ] **Step 2 :** FAIL. **Step 3 :** Implémenter. **Step 4 :** PASS. **Step 5 :** Commit : `feat: structured logger with redaction`.

### Task 6 : Ports `platform/` et adapters fake + BullMQ + worker (T05)

**Files:** Create `src/platform/{clock,queue,storage,weather,email,embeddings,ai,audit}/port.ts` et `fake.ts` ; `src/platform/queue/bullmq.ts` ; `src/worker/index.ts` ; `src/platform/index.ts` ; `tests/platform/fakes.test.ts`, `tests/platform/queue.int.test.ts` ; ajouter `worker` à `compose.yaml` + `Dockerfile`.

**Interfaces:** Produces —
`Clock { now(): Date }` ; `Queue { enqueue<T>(queue: string, payload: T, opts?: { jobId?: string; delayMs?: number }): Promise<void> }` ; `Storage { put(key: string, body: Uint8Array, contentType: string): Promise<void>; getSignedUrl(key: string, ttlSeconds: number): Promise<string>; delete(key: string): Promise<void> }` ; `Email { send(msg: { to: string; subject: string; text: string }): Promise<void> }` ; `Weather { forecast(q: { lat: number; lon: number; timezone: string; from: Date; to: Date }): Promise<unknown | null> }` (signature affinée en phase 06) ; `Embeddings { readonly modelId: string; readonly dimensions: number; embed(texts: string[]): Promise<number[][]> }` ; `Ai { complete(prompt: string): Promise<string> }` ; `Audit { record(e: { actorId: string | null; action: string; target?: string }): Promise<void> }` ; `createFakePlatform(): Platform` ; `startWorker(deps: { redisUrl: string; handlers: Record<string, (payload: unknown) => Promise<void>> }): Promise<{ close(): Promise<void> }>`.

- [ ] **Step 1 :** `fakes.test.ts` : `fake_email_records_sent_messages` ; `fake_queue_dedupes_same_jobId` ; `fake_storage_signed_url_expires_after_ttl` (horloge fake) ; `fake_clock_is_settable`.
- [ ] **Step 2 :** `queue.int.test.ts` (Redis réel) : `same_jobId_enqueued_twice_is_processed_once`.
- [ ] **Step 3 :** FAIL. **Step 4 :** Implémenter fakes, adapter BullMQ (jobId = clé d'idempotence), worker (arrêt propre sur `SIGTERM`). **Step 5 :** PASS (unit + int).
- [ ] **Step 6 :** Service `worker` dans `compose.yaml` avec healthcheck ; `docker compose up -d --wait` : `worker` `healthy`. **Step 7 :** Commit : `feat: platform ports, fakes, bullmq queue and worker`.

### Task 7 : Noyau HTTP — erreurs, `withApi`, pagination, ids, ETag, ownerId (T03)

**Files:** Create `src/platform/http/{errors,with-api,pagination,ids,etag,owner-scope}.ts`, `tests/platform/http/*.test.ts`.

**Interfaces:** Produces —
`class AppError extends Error { constructor(code: string, status: number, message: string, errors?: { path: string; message: string }[]) }` ; `toProblem(err: unknown, requestId: string): ProblemJson` ; `withApi(handler: (req: Request, ctx: { requestId: string; log: Logger }) => Promise<Response>): (req: Request) => Promise<Response>` ;
`encodeCursor(v: { id: string }): string` ; `decodeCursor(s: string): { id: string }` (lève `AppError('INVALID_CURSOR', 400, …)`) ; `parsePage(p: URLSearchParams): { limit: number; cursor?: { id: string } }` (défaut 20, max 100) ;
`newId(): string` (UUIDv7) ; `etagFor(version: number): string` (`W/"v<version>"`) ; `assertIfMatch(header: string | null, version: number): void` (`null` → 428 `IF_MATCH_REQUIRED`, écart → 409 `VERSION_CONFLICT`) ;
`type OwnerId = string & { readonly __brand: 'OwnerId' }` ; `asOwnerId(v: string): OwnerId` ; `interface OwnerScopedRepository<T> { findById(ownerId: OwnerId, id: string): Promise<T | null>; list(ownerId: OwnerId, page: { limit: number; cursor?: { id: string } }): Promise<{ items: T[]; nextCursor?: string }> }`.

- [ ] **Step 1 :** Tests `withApi` : `app_error_maps_to_problem_json` (404, `application/problem+json`, champs `type,title,status,code,detail,requestId`) ; `unexpected_error_is_500_without_message_or_stack` (corps sans `boom` ni `at `) ; `zod_error_is_400_with_errors_array` ; `inbound_request_id_with_newline_or_500_chars_is_replaced` (regex acceptée `^[A-Za-z0-9-]{8,64}$`, id généré dans l'en-tête de réponse `X-Request-Id`, jamais l'entrant dans les logs).
- [ ] **Step 2 :** Tests pagination : `roundtrip_cursor` ; `tampered_or_non_base64_cursor_is_400_INVALID_CURSOR` ; `limit_above_100_is_clamped`. Tests ids : `newId_matches_uuid_v7_regex` ; `1000_sequential_ids_sort_ascending`. Tests ETag : mismatch → 409, `null` → 428.
- [ ] **Step 3 :** Test de type `owner-scope.test-d.ts` : appeler `repo.findById('abc')` ou avec une `string` nue échoue avec `// @ts-expect-error` ; avec `asOwnerId('u1')` compile.
- [ ] **Step 4 :** FAIL. **Step 5 :** Implémenter (curseur = base64url d'un JSON `{ id }`, validé par Zod au décodage). **Step 6 :** PASS + `pnpm typecheck`. **Step 7 :** Commit : `feat: http core (errors, pagination, ids, etag, owner scope)`.

### Task 8 : Idempotence avec table `IdempotencyRecord` (T03)

**Files:** Create `prisma/schema.prisma` (+ migration SQL versionnée), `src/platform/db.ts`, `src/platform/http/idempotency.ts`, `tests/platform/idempotency.int.test.ts`.

**Interfaces:** Consumes — `AppError`, `newId`. Produces — modèle `IdempotencyRecord { id, userId, key, requestHash, status, responseBody Json?, createdAt }` avec `@@unique([userId, key])` (pas de clé étrangère : aucune table User en Phase 02) ; `createDb(url: string): PrismaClient` ; `withIdempotency<T>(db: PrismaClient, ctx: { userId: string; key: string; requestHash: string }, run: () => Promise<{ status: number; body: T }>): Promise<{ status: number; body: T; replayed: boolean }>`.

- [ ] **Step 1 :** Tests d'intégration (MariaDB réelle) : `first_call_runs_and_stores` ; `same_key_same_hash_replays_without_running` (`run` appelé 1 fois, `replayed: true`) ; `same_key_different_hash_is_422_IDEMPOTENCY_KEY_REUSED` ; `two_concurrent_calls_run_once` (un des deux : 409 `IDEMPOTENCY_IN_PROGRESS` ou rejeu) ; `same_key_other_user_is_independent`.
- [ ] **Step 2 :** FAIL. **Step 3 :** Implémenter : insérer une ligne `pending` d'abord (conflit d'unicité = lecture et comparaison), exécuter `run`, mettre à jour la ligne. **Step 4 :** Appliquer la migration sur DB jetable, PASS. **Step 5 :** Commit : `feat: idempotency records and withIdempotency`.

### Task 9 : OpenAPI depuis Zod, `/health`, `/ready` (T03/T10)

**Files:** Create `src/platform/openapi/{registry,build}.ts`, `scripts/gen-openapi.ts`, `openapi.json`, `src/app/api/v1/health/route.ts`, `src/app/api/v1/ready/route.ts`, `tests/platform/openapi.test.ts`, `tests/platform/ready.int.test.ts`. Scripts `openapi:gen`, `openapi:check`.

**Interfaces:** Consumes — `withApi`, `getEnv`, `createDb`. Produces — `registerRoute(r: { method: 'get'|'post'|'put'|'patch'|'delete'; path: string; request?: unknown; responses: Record<number, unknown> }): void` ; `buildOpenApi(): OpenAPIObject`.

- [ ] **Step 1 :** Tests : `openapi_contains_health_and_ready` ; `openapi_check_fails_when_committed_file_differs` ; `health_is_200_without_touching_db_or_redis` ; `ready_without_valid_bearer_is_401` ; `ready_ok_is_200`.
- [ ] **Step 2 :** Test d'intégration (Review Focus 4) : base arrêtée (`docker compose stop db`) → `/ready` 503 avec corps problem+json sans pile, `/health` toujours 200 ; idem Redis arrêté. Comparaison du jeton en temps constant.
- [ ] **Step 3 :** FAIL. **Step 4 :** Implémenter registry, build, routes ; `pnpm openapi:gen`. **Step 5 :** PASS. **Step 6 :** Commit : `feat: openapi generation and health/ready endpoints`.

### Task 10 : Routage i18n, RTL et formats (T06)

**Files:** Create `src/i18n/{config,routing,format}.ts`, `src/i18n/messages/{fr,en,ar}.json`, `src/middleware.ts`, `src/app/[locale]/layout.tsx`, `tests/i18n/*.test.ts`.

**Interfaces:** Produces — `LOCALES = ['fr','en','ar'] as const`, `DEFAULT_LOCALE = 'fr'`, `type Locale` ; `dirFor(locale: Locale): 'ltr' | 'rtl'` ; `resolveLocale(pathname: string): { locale: Locale; redirectTo?: string }` ; `getMessage(locale: Locale, key: string): string` (repli fr) ; `formatDate(locale: Locale, date: Date, timeZone: string): string` ; `formatNumber(locale: Locale, n: number): string` (numbering system `latn` explicite).

- [ ] **Step 1 :** Tests : `dirFor('ar') === 'rtl'`, `fr`/`en` → `ltr` ; `resolveLocale('/de/dressing')` et `resolveLocale('/dressing')` → `redirectTo: '/fr/dressing'` ; `resolveLocale('/ar/dressing')` sans redirection ; `missing_key_in_en_falls_back_to_fr_value` ; `message_keys_are_identical_across_fr_en_ar` ; `formatNumber('ar', 1234.5)` ne contient que des chiffres ASCII.
- [ ] **Step 2 :** FAIL. **Step 3 :** Implémenter ; layout `[locale]` pose `<html lang dir>`. **Step 4 :** PASS. **Step 5 :** Commit : `feat: i18n routing, rtl and formats`.

### Task 11 : Tokens, contrastes et maquettes des parcours prioritaires (T07) — **gate utilisateur**

**Files:** Create `src/ui/tokens.css`, `src/ui/contrast.ts`, `tests/ui/{contrast,no-physical-css}.test.ts`, `docs/design/mockups/{dressing,fiche-vetement,tenue-du-jour,recherche}.html`.

**Interfaces:** Produces — variables CSS `--color-{surface,bg,text,text-muted,primary,on-primary,border}` et, par ton `success|warning|danger|info|neutral`, `--color-tone-<ton>-{fg,bg}` ; `contrastRatio(hexA: string, hexB: string): number` ; `--font-sans` (pile système avec repli arabe explicite, ex. `system-ui, 'Segoe UI', 'Noto Sans Arabic', 'Geeza Pro', sans-serif`), à valider sur appareils réels en CP-02.

- [ ] **Step 1 :** Tests : `contrastRatio('#000000','#FFFFFF') ≈ 21` ; `text_pairs_meet_4_5` (text/bg, text/surface, text-muted/bg, text-muted/surface, on-primary/primary, chaque ton fg/bg) lus par regex depuis `tokens.css` ; `border_meets_3_on_surface` ; `font_sans_token_defines_arabic_fallback` (`--font-sans` contient `Noto Sans Arabic`) ; `no_physical_css_classes` (échec si `src/ui`, `src/app` contiennent `ml-|mr-|pl-|pr-|left-|right-|text-left|text-right|rounded-l|rounded-r`).
- [ ] **Step 2 :** FAIL. **Step 3 :** Écrire `tokens.css` (valeurs du Global Constraints ; success `#16794A` sur `#DDF3E8`, warning `#8A5A00` sur `#FFF1D6`, autres tons choisis pour passer le test). **Step 4 :** PASS.
- [ ] **Step 5 :** Maquettes HTML statiques (direction B, fr + version `ar` RTL du Dressing) des 4 parcours. **Présenter à l'utilisateur et attendre son approbation avant Task 12.**
- [ ] **Step 6 :** Commit : `feat: design tokens and approved mockups`.

### Task 12 : Composants de base accessibles (T08)

**Files:** Create `src/ui/components/{Button,TextField,Dialog,StatusBadge,Bdi,EmptyState,ErrorState,LoadingState}.tsx`, `tests/ui/components.test.tsx` (Vitest + Testing Library).

**Interfaces:** Consumes — tokens (Task 11), primitives de la matrice. Produces — `Button({ variant: 'primary'|'secondary'; ...ButtonHTMLAttributes })` ; `TextField({ label: string; error?: string; ...InputHTMLAttributes })` ; `Dialog({ open: boolean; onOpenChange(open: boolean): void; title: string; children })` ; `StatusBadge({ tone: 'success'|'warning'|'danger'|'info'|'neutral'; label: string; icon: ReactNode })` (agnostique des 6 statuts, mappés en phase 04) ; `Bdi({ children: string })` (`<bdi dir="auto">`, e-mails forcés `dir="ltr"`) ; `EmptyState/ErrorState/LoadingState({ title: string; description?: string; action?: ReactNode })`.

- [ ] **Step 1 :** Tests : `button_and_field_have_min_44px_target` (classe `min-h-11 min-w-11`) ; `textfield_label_is_associated_and_error_has_role_alert` ; `dialog_traps_focus_and_closes_on_escape` ; `status_badge_renders_icon_text_and_tone_class` ; `bdi_renders_email_ltr_inside_rtl_text` (`user@exemple.com` dans « البريد: … » garde `dir="ltr"`) ; `error_state_has_role_alert`.
- [ ] **Step 2 :** FAIL. **Step 3 :** Implémenter. **Step 4 :** PASS + `no_physical_css_classes` toujours vert. **Step 5 :** Commit : `feat: base accessible components`.

### Task 13 : Galerie, cartes, calendrier et page `/[locale]/dev/ui` (T08/T11)

**Files:** Create `src/ui/components/{Gallery,GarmentCard,OutfitCard,MonthCalendar}.tsx`, `src/app/[locale]/dev/ui/page.tsx`, `src/app/[locale]/error.tsx` (error boundary de route, rend `ErrorState`), `tests/ui/{gallery,calendar}.test.tsx`.

**Interfaces:** Produces — `GarmentCard({ name: string; photoUrl?: string; badge: ReactNode })` ; `OutfitCard({ title: string; occasion?: string; pieceCount: number; badge?: ReactNode })` ; `Gallery({ children })` (grille 2 colonnes mobile) ; `MonthCalendar({ year: number; month: number /*1-12*/; locale: Locale; weekStartsOn?: 0|1|2|3|4|5|6 /*défaut 1*/; selected?: Date; onSelect(d: Date): void })`.

- [ ] **Step 1 :** Tests : `calendar_renders_28_29_30_31_days_correctly` (fév. 2028 = 29) ; `calendar_weekday_names_follow_locale` (fr « lun. », ar via `Intl`) ; `calendar_day_buttons_are_keyboard_operable` ; `garment_card_without_photo_shows_placeholder` ; `dev_ui_page_returns_404_when_NODE_ENV_production` ; `route_error_boundary_renders_error_state`.
- [ ] **Step 2 :** FAIL. **Step 3 :** Implémenter ; la page dev affiche tous les composants. **Step 4 :** PASS. **Step 5 :** Commit : `feat: gallery, cards, calendar and dev ui page`.

### Task 14 : Playwright fr/en/ar/mobile, axe, vérification RTL (T11)

**Files:** Create `playwright.config.ts`, `e2e/dev-ui.spec.ts`.

**Interfaces:** Consumes — page dev UI. Produces — projets `fr-desktop`, `en-desktop`, `ar-desktop`, `fr-mobile` (375×812).

- [ ] **Step 1 :** Spec : `html_lang_and_dir_match_locale` (ar → `dir="rtl"`) ; `no_horizontal_scroll_on_mobile` ; `axe_has_no_violations_on_dev_ui` (tous projets) ; `rtl_grid_first_card_is_on_the_right` (ar : `x` du 1ᵉʳ `GarmentCard` > `x` du 2ᵉ ; fr : inverse) ; `keyboard_tab_reaches_dialog_trigger_and_escape_closes`.
- [ ] **Step 2 :** FAIL (si config/projets absents). **Step 3 :** Ajuster composants/config jusqu'à PASS sur les 4 projets. Violations axe corrigées, jamais désactivées. **Step 4 :** Commit : `test: playwright matrix with axe and rtl checks`.

### Task 15 : `verify`, scan de secrets, service web (T09)

**Files:** Modify `package.json`, `compose.yaml` ; Create `.secretlintrc.json`, `scripts/verify.sh`, `tests/verify/secret-scan.test.ts`.

**Interfaces:** Produces — `pnpm verify` enchaîne dans l'ordre : `lint`, `typecheck`, `boundaries`, `test`, `test:int` (Compose test up/down), `openapi:check`, `build`, `test:e2e`, scan de secrets ; service `web` (image du `Dockerfile`, seul service qui publie un port).

- [ ] **Step 1 :** Test : un fichier temporaire contenant une clé factice au format AWS (`AKIA` + 16 caractères) fait échouer le scan ; `.env.example` passe.
- [ ] **Step 2 :** Test Compose étendu : seul `web` publie un port dans `compose.yaml`.
- [ ] **Step 3 :** FAIL. **Step 4 :** Implémenter, ajouter `web`. **Step 5 :** `pnpm verify` sur arbre propre → code 0 ; casser volontairement un import de frontière → code ≠ 0. **Pas de fichier de workflow CI** (hébergement non choisi). **Step 6 :** Commit : `chore: verify pipeline, secret scan and web service`.

### Task 16 : Documentation et rapport CP-02 (T12)

**Files:** Create `README.md`, `docs/foundation/runbook-local.md`, `docs/foundation/cp-02-report.md`.

- [ ] **Step 1 :** README : prérequis, lancement local, commandes, structure, règles de frontières. Runbook : plan de migration, liste des coûts/fournisseurs ouverts (ADR-01, ADR-09, ADR-10), rappel que `docs/` du dépôt d'origine est absent.
- [ ] **Step 2 :** Rapport `critère → commande/test → résultat → preuve` pour chaque critère de la spec §11, avec sorties réelles de `pnpm verify` ; tout non exécuté = `NOT RUN`.
- [ ] **Step 3 :** Demander à l'utilisateur la validation **CP-02**. Aucun passage à la phase 03 sans elle.
