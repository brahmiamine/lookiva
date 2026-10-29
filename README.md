# Lookiva

Lookiva est une PWA de dressing privé, multi-utilisateurs, en français, anglais et arabe (RTL).
Ce dépôt contient le socle de la phase 02 : monolithe modulaire Next.js 16 (App Router) avec un worker BullMQ,
Prisma sur MariaDB 11.8, Redis 8, un design system accessible et la commande de contrôle `pnpm verify`.
La phase 03 (tranche 1) ajoute le module `identity` : comptes email/mot de passe vérifiés, sessions serveur révocables, préférences et onboarding ; la tranche 2b ajoute leurs écrans (voir « Écrans d'identité »).

## Prérequis

- Docker (Compose v2) en marche.
- Node.js >= 24.22.1 (pin de la [matrice de compatibilité](docs/foundation/compat-matrix.md), voir `.nvmrc` et `engines`).
  Une version 24.x plus basse n'est qu'un avertissement : `pnpm verify` a été exécuté sur Node 24.11.1 (voir le rapport CP-02).
- pnpm 12.15.0, fourni par corepack via le champ `packageManager` (`corepack enable`; étape documentée mais non testée dans cette session, où pnpm 12.15.0 était déjà disponible).
- `nc` (netcat), utilisé par le contrôle de ports de `pnpm verify`.

## Démarrage rapide

```bash
pnpm install
cp .env.example .env     # placeholders `change-me` uniquement, jamais de vraies valeurs committées
pnpm infra:up            # MariaDB + Redis (+ worker) sur 127.0.0.1:3307 et 127.0.0.1:6380
pnpm dev                 # http://localhost:3000 (redirige vers /fr)
pnpm infra:down          # arrête les conteneurs, garde les volumes (la base locale survit)
pnpm infra:reset         # arrête et SUPPRIME les volumes (down -v) : la base locale est perdue
```

Détails (ports, pile complète, migrations, dépannage) : [runbook local](docs/foundation/runbook-local.md).

## Commandes

| Commande | Rôle |
|---|---|
| `pnpm dev` | `next dev` (serveur de développement, port 3000). |
| `pnpm build` | Génère le client Prisma puis `next build` (sortie `standalone`). |
| `pnpm lint` | Génère le client Prisma puis ESLint sur tout le dépôt. |
| `pnpm typecheck` | Génère le client Prisma puis `tsc --noEmit` (TypeScript strict). |
| `pnpm test` | Tests unitaires Vitest (sans base ni Redis). |
| `pnpm test:int` | Tests d'intégration Vitest contre la vraie MariaDB/Redis ; demande `pnpm infra:up` avant ; applique les migrations en `globalSetup`. |
| `pnpm test:e2e` | Tests Playwright (Chromium, projets fr/en/ar desktop, fr/ar mobile) contre `next dev` sur le port 3100. **Prérequis : `pnpm infra:up`** (MariaDB 3307, Redis 6380) ; les migrations sont appliquées par `e2e/global-setup.ts`. |
| `pnpm e2e:install` | Installe Chromium pour Playwright. |
| `pnpm verify` | Contrôle unique : preflight ports, db:generate, lint, typecheck, boundaries, tests unitaires, intégration (infra dédiée `lookiva-verify`), openapi:check, build, e2e, scan de secrets. S'arrête à la première erreur. |
| `pnpm secrets:scan` | `secretlint` sur tout le dépôt. |
| `pnpm stack:up` | Construit et démarre toute la pile (db, redis, worker, web) avec le profil compose `app`. Seul `web` publie un port (`127.0.0.1:3000`). |
| `pnpm stack:down` | Arrête la pile `app` en gardant ses volumes. |
| `pnpm stack:reset` | Arrête la pile `app` et supprime ses volumes (`down -v`). |
| `pnpm infra:up` | Démarre db + redis + worker avec l'overlay `compose.test.yaml` qui publie MariaDB et Redis sur loopback (3307, 6380) pour les tests lancés depuis l'hôte. |
| `pnpm infra:down` | Arrête cette infra en gardant ses volumes. |
| `pnpm infra:reset` | Arrête cette infra et supprime ses volumes (`down -v`). `pnpm verify` l'utilise pour son propre projet `lookiva-verify`. |
| `pnpm boundaries` | `dependency-cruiser` : contrôle des frontières de modules sur `src/`. |
| `pnpm build:worker` | Bundle esbuild du worker vers `dist/worker.js`. |
| `pnpm db:generate` | `prisma generate` : client Prisma dans `src/generated/prisma` (non versionné). |
| `pnpm db:migrate:deploy` | `prisma migrate deploy` : applique les migrations versionnées sur la base de `DATABASE_URL`. |
| `pnpm openapi:bundle` | Bundle esbuild de `scripts/gen-openapi.ts` vers `dist/` (étape interne des deux suivantes). |
| `pnpm openapi:gen` | Régénère `openapi.json` à partir des schémas Zod. |
| `pnpm openapi:check` | Échoue si `openapi.json` diffère de ce que les schémas génèrent (dérive). |

## Structure

```
src/app/         App Router : pages localisées (src/app/[locale]) et API (src/app/api/v1)
src/modules/     modules métier, créés phase par phase (phase 03 : identity)
src/platform/    env, logger, noyau HTTP, OpenAPI, ports et adapters fake (db, storage, weather, email, embeddings, ai, clock, queue, audit)
src/worker/      point d'entrée du worker BullMQ (même code, autre process)
src/i18n/        routage des langues, formats Intl, messages fr/en/ar
src/ui/          design system : tokens CSS, composants accessibles
prisma/          schema.prisma et migrations versionnées
e2e/             tests Playwright
tests/           tests Vitest (unitaires et *.int.test.ts)
docs/            matrice de compatibilité, runbook, rapport CP-02, maquettes, spec et plan de la phase
plans/           plans produit d'origine (00 à 13) et règles pour les agents
```

## Frontières de modules

Dans chaque module (`src/modules/<domaine>/`) : `ui → api → application → domain`.
`infrastructure` implémente les ports définis par `application`/`domain`, sans que ceux-ci l'importent.
Les modules ne se parlent que par leur `index.ts` public. Règles appliquées par `pnpm boundaries`
(`.dependency-cruiser.cjs` : `domain-pure`, `no-infra-from-inner`, `module-public-only`, `external-module-public-only`, `platform-no-modules`, `ui-no-infra`), testées sur des fixtures dans `tests/boundaries` (dont l'alias `@/`).
`src/app`, `src/ui`, `src/worker` n'importent un module que par son `index.ts` ; `src/platform` n'importe aucun module.
Le noyau partagé `src/platform/kernel/` (`OwnerId`, `asOwnerId`, `OwnerScopedRepository`, `Page`) est la seule partie de `src/platform` importable depuis un `domain`.

## Conventions

- Identifiants opaques : UUIDv7 (`newId()`), aucun auto-incrément exposé.
- Temps stockés en UTC.
- Erreurs HTTP : `application/problem+json` (champs `type`, `title`, `status`, `code`, `detail`, `requestId`, `errors[]`), via `withApi`.
- Pagination par curseur (`limit`, `cursor`).
- Corps JSON : toujours `readJson(req, schema)` (`src/platform/http/body.ts`), jamais `req.json()` : 400 `INVALID_JSON` sans message du parseur, 400 `VALIDATION_ERROR` si le schéma échoue.
- Concurrence : ETag faible `W/"v<n>"` et `If-Match` (428 si absent, 409 en conflit).
- Idempotence : en-tête `Idempotency-Key` sur les POST critiques. Le handler lit la clé avec `readIdempotencyKey(req)` (`^[A-Za-z0-9_-]{8,128}$`, sinon 400 `IDEMPOTENCY_KEY_REQUIRED` / `IDEMPOTENCY_KEY_INVALID`), calcule `requestHash(method, path, canonicalJson(body))` (`src/platform/http/idempotency-key.ts`) puis appelle `withIdempotency` (table `idempotency_records` unique `(userId, key)`, `userId` de type `OwnerId`). `onPersistError` est obligatoire (journaliser la perte), le statut retourné doit être un entier 100-599 et le corps un JSON Prisma valide. Les enregistrements terminés sont purgés par `purgeIdempotencyRecords(db, olderThan)` (ex. 24 h) ; les enregistrements en cours ne le sont jamais.
- Journaux : toujours passer l'erreur sous la clé `err` (`log.error({ err }, ...)`) ; le sérialiseur (`serializeError`) tronque le message, retire `input`/`query`/`params`/`headers`/`body`/`request`/`config` et réduit les erreurs Prisma à `code` et `meta.target`. L'expurgation par jokers (`*.password`) ne couvre qu'un niveau.
- Jamais de push (file, notification, webhook) ni de suppression d'objet (stockage) à l'intérieur d'une transaction SQL.
- SQL brut uniquement dans `infrastructure`, toujours paramétré (spec §5).
- Isolation des données : tout repository exige un `OwnerId` en paramètre (type `OwnerId` de `src/platform/kernel`, oubli = erreur de compilation).
- Les schémas Zod sont la source unique de validation et d'OpenAPI (`openapi.json` versionné, contrôlé par `pnpm openapi:check`).

## Authentification (module `identity`)

Sessions opaques côté serveur (pas de JWT ni d'Auth.js). Détails, limites et choix : [runbook §9](docs/foundation/runbook-local.md#9-identité--sessions-csrf-limites-e-mails).

| Méthode et chemin | Rôle | Codes d'erreur notables |
|---|---|---|
| `POST /api/v1/auth/register` | Inscription (`Idempotency-Key` requis), 202 identique que l'email existe ou non ; envoie le lien de vérification | 400 `VALIDATION_ERROR`, 429, 503 `EMAIL_TRANSPORT_UNAVAILABLE` |
| `POST /api/v1/auth/email/verify` | Consomme le jeton de vérification (usage unique) | 400 `INVALID_TOKEN` (inconnu, utilisé ou expiré, sans distinction) |
| `POST /api/v1/auth/email/resend` | Renvoie le lien (cooldown 60 s), 202 identique pour un email inconnu | 429 |
| `POST /api/v1/auth/login` | Ouvre une session, pose le cookie `lookiva_session` | 401 `INVALID_CREDENTIALS`, 403 `EMAIL_NOT_VERIFIED` (seulement après un mot de passe correct), 429 |
| `POST /api/v1/auth/logout` | Révoque la session courante | 401 |
| `POST /api/v1/auth/logout-all` | Révoque toutes les sessions | 401 |
| `POST /api/v1/auth/password/forgot` | Lien de réinitialisation (`Idempotency-Key`), 202 identique pour un email inconnu | 429 |
| `POST /api/v1/auth/password/reset` | Nouveau mot de passe (`Idempotency-Key`), révoque toutes les sessions | 400 `INVALID_TOKEN` / `VALIDATION_ERROR` |
| `GET /api/v1/me` | Compte courant | 401 `UNAUTHENTICATED` |
| `GET /api/v1/me/sessions` | Sessions actives (pagination `limit`/`cursor`), `current` marque celle de la requête | 401 |
| `DELETE /api/v1/me/sessions/{id}` | Révoque une de ses sessions | 404 `NOT_FOUND` (y compris la session d'un autre utilisateur) |
| `GET /api/v1/me/preferences` | Préférences + `ETag: W/"v<n>"` | 401 |
| `PATCH /api/v1/me/preferences` | Mise à jour partielle, `If-Match` obligatoire | 428 `IF_MATCH_REQUIRED`, 409 `VERSION_CONFLICT` |
| `POST /api/v1/me/onboarding` | Langue + ville obligatoires ; GPS, pays et fuseau IANA facultatifs (candidat de `/geo/cities` ou saisie manuelle avec fuseau explicite) | 400 `VALIDATION_ERROR` |
| `GET /api/v1/geo/cities?q=` | Candidats de ville (max 5, noms dans la langue de l'utilisateur, fuseau/latitude/longitude pré-remplis) ; 30 requêtes/min/utilisateur ; `q` (2 à 80 caractères) n'est jamais journalisé ; géocodeur factice, aucun fournisseur externe | 400, 401, 429 |
| `POST /api/v1/me/deactivate` | Désactive le compte (`DISABLED`, toutes les sessions révoquées) ; mot de passe courant dans le corps | 401 `INVALID_CREDENTIALS` (mauvais mot de passe), 429 |
| `POST /api/v1/me/deletion-request` | Demande d'effacement (`DELETION_REQUESTED`, sessions révoquées, idempotent) ; mot de passe dans le corps ; 202 : les sauvegardes ne sont PAS purgées immédiatement | 401, 429 |
| `DELETE /api/v1/me/deletion-request` | Annule une demande `PENDING` ; sans session (toutes révoquées) : e-mail + mot de passe dans le corps, limites de login | 401 `INVALID_CREDENTIALS` (aussi pour un compte `ACTIVE`/`DISABLED` : la route ne révèle pas le statut), 404 (`DELETION_REQUESTED` sans demande en attente), 429 |
| `POST /api/v1/me/export-requests` | Enregistre une demande d'export (202, `PENDING`, 3/jour/utilisateur) ; rien n'est généré | 401, 429 |
| `GET /api/v1/me/export-requests` | Ses propres demandes d'export (pagination `limit`/`cursor`) | 401 |
| `GET /api/v1/me/consents` | Dernier consentement par type (`AI_RECOMMENDATIONS`, `LEARNING`, `CLOUD_BACKGROUND_REMOVAL`) | 401 |
| `PUT /api/v1/me/consents/{kind}` | `{ "granted": bool }` : ajoute un `ConsentRecord` et aligne `aiEnabled`/`learningEnabled` dans la même transaction ; aucun type ne couvre la reconnaissance de photos (les photos ne vont jamais à une IA) ; 30 requêtes/min/utilisateur | 400, 404 (type inconnu), 429 |

## Dressing (module `wardrobe`, tranche 4a)

Garde le détail dans [runbook §12](docs/foundation/runbook-local.md#12-dressing--vêtements-états-sous-catégories-perso-tranche-4a). Toutes les routes privées exigent la session (401) et ne voient que les données de l'utilisateur (404 sinon) ; écritures limitées à 120/min/utilisateur (429).

| Méthode et chemin | Rôle | Codes d'erreur notables |
|---|---|---|
| `GET /api/v1/catalog/categories`, `/colors`, `/options` | Référentiels FR/EN/AR (catégories + sous-types, 16 couleurs + nuances, statuts, saisons, styles, valeurs météo) ; public | |
| `POST /api/v1/garments` | Crée un vêtement `AVAILABLE` (`Idempotency-Key` requis) ; catégorie, sous-type (ou sous-catégorie perso) et couleur principale obligatoires | 400, 404 (sous-catégorie inconnue), 409/422 idempotence |
| `GET /api/v1/garments` | Pagination `limit`/`cursor`, filtres `category`, `subtype`, `color`, `season`, `style`, `status`, `q` | 400 |
| `GET/PATCH/DELETE /api/v1/garments/{id}` | Fiche + `ETag` ; `PATCH` avec `If-Match` ; `DELETE` = corbeille (`deletedAt`, `purgeAfter` +30 j) | 404, 409 `VERSION_CONFLICT`, 428 `IF_MATCH_REQUIRED` |
| `POST /api/v1/garments/{id}/status` | `{ status, note? }` avec `If-Match`, écrit l'historique dans la même transaction | 409 `VERSION_CONFLICT` / `STATUS_UNCHANGED`, 428 |
| `GET /api/v1/garments/{id}/status-history` | Événements, plus récent d'abord | 404 |
| `POST/GET /api/v1/custom-subcategories` | Sous-catégories perso rattachées à un sous-type standard (libellé unique par utilisateur) | 409 `CUSTOM_SUBCATEGORY_EXISTS` |
| `PATCH /api/v1/custom-subcategories/{id}` | Renomme (`If-Match`) | 409, 428 |
| `DELETE /api/v1/custom-subcategories/{id}?reassignTo=` | Supprime ; si des vêtements l'utilisent, `reassignTo` (sous-type standard ou autre sous-catégorie perso de la même catégorie) est obligatoire, déplacement atomique | 409 `CUSTOM_SUBCATEGORY_IN_USE`, 400 |

Photos (tranche 4b, [runbook §13](docs/foundation/runbook-local.md#13-dressing--photos-et-stockage-objet-privé-tranche-4b)) : stockage privé local (`STORAGE_LOCAL_DIR`), jamais d'URL publique.

| Méthode et chemin | Rôle | Codes d'erreur notables |
|---|---|---|
| `GET /api/v1/garments/{id}/photos` | Métadonnées des photos (jamais les clés de stockage) | 404 |
| `POST /api/v1/garments/{id}/photos` | Multipart `file` (+ `rotate`, `crop`) : JPEG/PNG/WebP, 10 Mio, 5 photos max ; la première est principale ; EXIF/GPS retirés des variantes | 409 `PHOTO_LIMIT_REACHED`, 413, 415, 422 |
| `PUT /api/v1/garments/{id}/photos/{photoId}/primary` | Change la photo principale (atomique) | 404 |
| `DELETE /api/v1/garments/{id}/photos/{photoId}` | Supprime la ligne puis les objets non référencés ; la suivante devient principale | 404 |
| `GET /api/v1/garments/{id}/photos/{photoId}/file?variant=thumb\|optimized\|original\|cutout` | Diffuse les octets au propriétaire seul (`no-store`, `nosniff`) | 400, 404 |
| `POST /api/v1/garments/{id}/photos/{photoId}/cutout` | Détourage local opt-in ; échec : `cutoutStatus: FAILED`, photo conservée | 404 |

Tranche 4c : duplication, actions groupées, corbeille, étiquettes/collections/ensembles (détail et schémas : `openapi.json`).

| Route | Rôle | Erreurs |
|---|---|---|
| `POST /api/v1/garments/{id}/duplicate` | `Idempotency-Key` requis ; nouveau vêtement (AVAILABLE, v1, sans historique), corps = surcharges optionnelles + `copyPhotos` (objets partagés, comptés par référence) | 400, 404, 409, 422 |
| `POST /api/v1/garments/bulk-actions` | `SET_STATUS \| SET_CATEGORY \| DELETE` sur 100 ids max, tout ou rien ; ids inconnus/étrangers/en corbeille = 404 par id ; `expectedVersions` optionnel (409 par id) ; `Idempotency-Key` requis | 400, 404, 409 |
| `GET /api/v1/garments/trash` · `POST /api/v1/garments/{id}/restore` | Corbeille (`purgeAfter`), restauration tant que `purgeAfter` > maintenant | 404, 409 `CUSTOM_SUBCATEGORY_MISSING`, 410 `TRASH_EXPIRED` |
| `/api/v1/tags`, `/collections`, `/garment-sets` (+ `/{id}/garments`, `/{id}/garments/{garmentId}`) | CRUD (`name` unique par utilisateur, `If-Match`), rattacher/détacher des vêtements (ordre conservé, vêtements en corbeille signalés `trashed`) | 404, 409 `NAME_ALREADY_USED` |

La purge quotidienne (`wardrobe-purge`, tâche répétée BullMQ du worker) supprime les vêtements dont `purgeAfter` est passé, puis les objets photo non référencés. Le worker doit partager `STORAGE_LOCAL_DIR` avec le web. `GarmentUsageChecker` (par défaut : aucun avertissement) alimente `warnings` à la suppression ; les tenues arrivent en phase 05. Contrat d'archive `lookiva-archive` v1 : `prevalidateArchive(json)` (sans écriture).

Cycle de vie du compte : la ré-authentification (mot de passe) est limitée à 5 essais/15 min par utilisateur ; tout échec est un 401 générique. Un compte `DISABLED` ou `DELETION_REQUESTED` ne peut pas se connecter (même 401 générique qu'un mot de passe faux). Il n'existe pas encore de réactivation d'un compte `DISABLED`.

Toute requête POST/PUT/PATCH/DELETE vers ces routes exige `X-Requested-With: lookiva` (et un `Origin` égal à l'origine de l'application s'il est présent), sinon 403 `CSRF_REJECTED`.
Toutes ces routes peuvent répondre 503 (`EMAIL_TRANSPORT_UNAVAILABLE`, `RATE_LIMITER_UNAVAILABLE`) et, avec un corps de plus de 16 Kio, 413 `PAYLOAD_TOO_LARGE`.
Aucune connexion n'est possible avant la vérification de l'adresse. Tant que le compte n'est pas vérifié, chaque inscription envoie un lien qui porte le hash de SON mot de passe : à l'ouverture d'un lien, c'est ce mot de passe qui devient celui du compte (un « renvoyer » réutilise le mot de passe du dernier lien non utilisé). Une fois l'adresse vérifiée, ou après une réinitialisation, aucun ancien lien ne peut plus changer le mot de passe. Limite connue : un attaquant qui se réinscrit après le titulaire et avant son clic possède le lien le plus récent ; le titulaire récupère le compte par « mot de passe oublié ». Détails : [runbook §9](docs/foundation/runbook-local.md#9-identité--sessions-csrf-limites-e-mails).
`APP_ORIGIN` est obligatoire dès que des e-mails peuvent partir (y compris en dev avec `EMAIL_TRANSPORT=outbox` : l'ajouter à un `.env` existant) et en production, où `TRUST_PROXY=true` est aussi exigé (sauf `TRUST_PROXY_ACK_SINGLE_BUCKET=true`).
Les routes privées des autres modules utilisent `withSession(handler)` exporté par `@/modules/identity` : il reçoit `{ requestId, log, userId: OwnerId, sessionId }`.

## Écrans d'identité

| Route (`/<langue>/...`) | Écran | Accès |
|---|---|---|
| `login` | Connexion (erreur générique, attente 429 avec bouton bloqué) | public |
| `register` | Inscription (mesure de longueur, confirmation, conditions) | public |
| `verify-email` | « Vérifiez votre e-mail » + renvoi (délai 60 s) ; avec `#token=` : vérification | public |
| `forgot-password` | Demande de lien (même réponse que le compte existe ou non) | public |
| `reset-password` | Nouveau mot de passe depuis `#token=` (toutes les sessions fermées) | public |
| `onboarding` | 2 étapes : langue, ville (recherche `/geo/cities`, saisie manuelle + fuseau IANA, GPS facultatif au clic) | session |
| `settings/profile` | Préférences (`If-Match`, message 409), IA désactivée par défaut, export, suppression avec mot de passe, déconnexion | session + onboarding fait |
| `settings/sessions` | Sessions, « Cet appareil », révocation, « Se déconnecter partout » avec confirmation | session + onboarding fait |

Garde côté serveur (`src/app/[locale]/(app)/server-api.ts`) : sans session valide, redirection vers `login` ; onboarding non terminé, vers `onboarding`.
Le jeton des liens e-mail est lu dans le fragment par la page, retiré de l'URL puis envoyé en POST : il n'apparaît dans aucune URL de requête ni aucun journal.
Le client navigateur `src/ui/api-client.ts` ajoute `X-Requested-With: lookiva`, une `Idempotency-Key` quand la route l'exige, `If-Match`, et convertit `application/problem+json` en `ApiError` (avec `Retry-After`) ; il ne journalise rien.
Écarts avec les maquettes, limites et NON EXÉCUTÉ : [runbook §11](docs/foundation/runbook-local.md#11-écrans-didentité-tranche-2b).

## i18n et RTL

- Langues `fr` (défaut et repli), `en`, `ar` (`dir="rtl"` posé sur `<html>`). Un fichier de messages par langue dans `src/i18n/messages`.
- CSS logique uniquement (`ms-*`, `ps-*`, `start`, `end`, ...) : pas de `left`/`right`/`ml-`/`pl-`...; un test (`tests/ui/no-physical-css.test.ts`) le fait respecter dans `src/ui` et `src/app`.
- Le texte saisi par l'utilisateur n'est jamais traduit ; dates et nombres passent par `Intl`.
- Composants client : `useTranslations` sous `IntlProvider` (`src/ui/components/IntlProvider.tsx`), qui ne reçoit que les espaces de noms utiles (`pickMessages(locale, [...])`) : aucun catalogue complet n'est envoyé au navigateur (exception documentée : `global-error.tsx`).
- Icônes directionnelles (retour, flèches) : `<Icon name=... directional />`, inversée en RTL par `rtl:-scale-x-100` ; les autres icônes ne le sont jamais.
- Titres de document : `generateMetadata` du layout (`%s · Lookiva`) et de chaque page ; 404 localisée (`[locale]/not-found.tsx`).

## Page de démonstration UI

`/fr/dev/ui` (aussi `/en/dev/ui`, `/ar/dev/ui`) montre tous les composants. Elle n'existe qu'en développement : elle répond 404 en build de production.

## Règle de travail

Pas de `git init`, de `git push` ni de déploiement sans l'accord explicite du propriétaire du produit.
Le dépôt git actuel est local, sans remote.

## Documentation

- [Runbook local](docs/foundation/runbook-local.md) : infra, migrations, variables, ports, dépannage, coûts et fournisseurs ouverts.
- [Rapport CP-02](docs/foundation/cp-02-report.md) : preuves par critère, couverture du plan 02, risques.
- [Matrice de compatibilité](docs/foundation/compat-matrix.md) : versions épinglées et POC.
- [Maquettes](docs/design/mockups/index.html) (direction B · Studio).
- Spec et plan de la phase : `docs/superpowers/specs/` et `docs/superpowers/plans/`.
- Le dossier `docs/` d'origine cité par les plans (registre des décisions, règles métier, ADR, modèle de données, contrats API, critères d'acceptation) n'existe pas dans ce dépôt : les plans de `plans/` sont la seule source.
