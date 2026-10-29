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

La purge quotidienne (`wardrobe-purge`, tâche répétée BullMQ du worker) supprime les vêtements dont `purgeAfter` est passé, puis les objets photo non référencés. Le worker doit partager `STORAGE_LOCAL_DIR` avec le web. `GarmentUsageChecker` (implémenté par le module `outfits` : vêtements présents dans des tenues DRAFT/PLANNED) alimente `warnings` à la suppression et à la suppression groupée. Contrat d'archive `lookiva-archive` v1 : `prevalidateArchive(json)` (sans écriture).

## Tenues, modèles, port réel (module `outfits`, phase 05 backend)

Détail : [runbook §14](docs/foundation/runbook-local.md#14-tenues-modèles-port-réel-et-lavage-facultatif-phase-05-backend). Session obligatoire (401), données du propriétaire seul (404 sinon), écritures 120/min/utilisateur (429). `Idempotency-Key` requis sur les POST marqués (IK) ; `If-Match` (ETag `W/"v<version>"`) sur les modifications.

| Route | Rôle | Erreurs |
|---|---|---|
| `POST` (IK) / `GET /api/v1/outfits` | Crée (brouillon incomplet permis ; PLANNED = `startsAt` ISO avec offset + `timezone` IANA + `occasion`) ; liste `?from=&to=` (dates locales, ordre chronologique, plusieurs tenues par jour) sinon curseur | 400, 404 (vêtement inconnu/étranger/en corbeille), 409/422 idempotence |
| `GET/PATCH/DELETE /api/v1/outfits/{id}` | Fiche + `warnings` (rôles manquants, vêtement indisponible/en corbeille : jamais bloquants) ; `DELETE` = statut CANCELLED | 404, 409 `OUTFIT_NOT_EDITABLE`/`VERSION_CONFLICT`, 428 |
| `POST /api/v1/outfits/{id}/items` · `PUT/DELETE .../items/{garmentId}` | Ajouter / remplacer / retirer un vêtement (`If-Match`) | 404, 409 `GARMENT_ALREADY_IN_OUTFIT` |
| `GET /api/v1/outfits/{id}/conflicts` | Chevauchement certain / possible, vêtement indisponible + remplaçants `AVAILABLE` de même catégorie ; jamais bloquant | 404 |
| `POST /api/v1/outfits/{id}/confirm-worn` (IK) | `{ expectedVersion }` : UNE transaction tenue WORN + WearRecord + instantané ; ne change aucun état de vêtement | 409 `ALREADY_WORN`/`VERSION_CONFLICT` |
| `POST /api/v1/wear-records/{id}/mark-to-wash` (IK) | Étape facultative séparée : `{ garmentIds, expectedVersions? }` ; résultat `marked` / `skipped` / `failed` par id, jamais de rollback du port | 409 `WEAR_RECORD_INVALIDATED` |
| `GET /api/v1/wear-records/{id}` · `POST .../invalidate` | Instantané ; correction auditée (`reason`, `If-Match`) qui libère la tenue | 409 `ALREADY_INVALIDATED` |
| `GET /api/v1/outfits/last-worn?limit=3` · `GET /api/v1/garments/{id}/wear-history?limit=3` | Derniers ports (instantanés, sans photo) ; dernières dates par vêtement | 400, 404 |
| `/api/v1/outfit-templates` (+ `/{id}`, `POST /{id}/instantiate` (IK), `POST /api/v1/outfits/{id}/save-as-template` (IK)) | Modèles indépendants de toute date ; l'instanciation ne modifie pas le modèle | 404, 409 |

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

## Recherche privée (phase 07, tranche textuelle)

`/fr/recherche`, `/en/recherche` et `/ar/recherche` recherchent dans les vêtements du compte connecté :
nom, notes, magasin, sous-catégorie personnelle, étiquettes, collections et ensembles, ainsi que les libellés
trilingues du catalogue. Le lexique versionné `text-v1` ajoute des synonymes ciblés et des corrections
estimées de fautes simples. Les filtres catégorie/type/couleur/état/saison/style sont stricts, même lorsqu'ils
contredisent les mots de la recherche. Les négations de propriétés du catalogue sont signalées comme
non prises en charge ; aucun résultat contraire n'est proposé.

- `GET/POST /api/v1/search/garments` : champs `q`, `category`, `subtype`, `color`, `status`, `season`, `style`,
  `tag`, `collection`, `set`, `sort` (`relevance`, `newest`, `availability`), `limit` (1–100), `cursor`.
  L'écran utilise POST pour ne pas placer le texte personnel dans les URL. Session requise, `no-store`,
  30 appels/minute/utilisateur sur les trois endpoints de recherche. Les POST exigent les protections CSRF habituelles.
- `GET /api/v1/search/suggestions?q=...` : interprétation du catalogue, sans historique ni agrégat privé.
- `POST /api/v1/search/outfit-draft` : `{ garmentIds: [...] }` (1–30 IDs uniques), revérifie propriétaire et corbeille,
  renvoie les pièces indisponibles et `saved: false`. Le passage à l'éditeur préremplit une tenue **sans l'enregistrer**.
  L'accès aux vêtements est de nouveau vérifié à l'ouverture, puis à l'enregistrement par le module tenues.

Les sources sont relues à chaque recherche : édition, états, groupes, corbeille et restauration sont immédiatement
visibles, sans index à réconcilier. Le classement utilise les propriétés reconnues (10 points/champ) et les mots
personnels (5 points dans le nom, 2 ailleurs), puis la date de création et l'ID ; aucun score n'est une probabilité.
Les corrections estimées sont affichées. Un curseur appartient à une requête et un utilisateur ; si son point de
reprise a disparu, l'API demande de recommencer (`INVALID_CURSOR`). Le classement étant recalculé, la pagination
n'est pas un instantané : après une modification concurrente, relancer la recherche pour une liste complète.
Au-delà de 5000 candidats, l'API refuse explicitement (`SEARCH_CAPACITY_EXCEEDED`) au lieu de tronquer silencieusement.

Cette tranche utilise uniquement le texte et ne transmet rien à un fournisseur externe. Les embeddings,
VECTOR/FULLTEXT, le corpus dialectal validé et les mesures de charge de CP-07 restent à réaliser.
Preuves et blocages observés : [rapport de continuation](docs/foundation/2026-10-29-continuation-report.md).

## Agenda et voyages (première tranche du plan 08)

`/fr/planning`, `/en/planning`, `/ar/planning` : événements à la journée (personnel/travail/sport,
intérieur/extérieur), récurrences quotidiennes/hebdomadaires/mensuelles, notes et checklists libres.
Les occurrences sont virtuelles, avec une clé stable `eventId:date`, générées sur une fenêtre de 366 jours
maximum. Un événement mensuel du 31 saute les mois dépourvus de ce jour. Dates locales et fuseau sont
conservés sans inventer d'heure ni de rappel aux changements DST.

Les voyages acceptent via l'API jusqu'à 30 étapes avec ville/fuseau/dates, sans chevauchement, et jusqu'à
100 pièces physiques distinctes. L'écran propose pour l'instant une ville et une checklist ; les éditions
multi-étapes et la sélection des pièces sont disponibles côté API. La préparation indique les vêtements
manquants ou indisponibles, le dépassement de capacité et l'absence de poids connu. Aucun port, lavage
ou changement d'état de vêtement n'est déclenché.

API privée : `GET/POST /events`, `GET/PUT/DELETE /events/{id}`, `GET /events/{id}/occurrences?from=&to=`,
les mêmes opérations sur `/trips` et `GET /trips/{id}/packing-suggestion`, sous `/api/v1`.
Création avec `Idempotency-Key`, PUT complet et suppression avec `If-Match` ; CSRF et limite de 120 appels/min/utilisateur.
Listes paginées (`limit`, `cursor`). Le CRUD conserve les références d'articles supprimés pour permettre
l'édition d'une checklist et afficher un avertissement de préparation ; les nouveaux articles doivent appartenir
au compte et être hors corbeille. Les dates/notes/listes sont persistées dans `planner_entries` et validées strictement.

Migration additive : `20261105090000_planning`. La chaîne historique de main décrite dans le rapport précédent
reste à réconcilier avant une installation complète. Les exceptions de récurrence, la modification des séries
avec préservation du passé, les modèles, phases de tenues et l'optimisation automatisée de valise ne sont pas
encore livrés ; CP-08 n'est pas déclaré validé.

## Activité : statistiques et rappels internes

`/fr/activity`, `/en/activity`, `/ar/activity` rassemblent les statistiques et le centre de notifications.
Les rappels sont désactivés par défaut : l'utilisateur les active explicitement et choisit 15 à 1440 minutes
avant ses tenues planifiées. Le worker vérifie les rappels toutes les cinq minutes ; le bouton Actualiser
permet aussi une vérification immédiate. Cela ne garantit pas une livraison à la minute exacte.
Aucun Web Push, permission navigateur ou message externe n'est envoyé.

Les notifications sont privées, marquables comme lues et supprimables. Une suppression garde un marqueur
jusqu'à expiration pour empêcher une recréation lors d'un retry. Les tenues annulées, déjà portées ou
replanifiées ne produisent plus de rappel visible pour l'ancienne date. Rétention et purge : 90 jours.
Désactiver les rappels empêche leur génération lors des vérifications suivantes ; les notifications déjà
créées restent consultables jusqu'à suppression/expiration. Chaque compte est traité indépendamment :
un compte en erreur ne bloque pas les suivants. Les erreurs sont journalisées sans payload personnel.

Les statistiques se basent uniquement sur les WearRecord ACTIVE et les vêtements actuels hors corbeille,
créés avant la fin de période. Le numérateur compte les pièces ayant un port confirmé dans la fenêtre UTC,
le dénominateur les pièces éligibles de l'inventaire courant : ce n'est pas une mesure de présence historique.
Les ports invalidés sont exclus ; plusieurs ports le même jour restent distincts. Le coût par port utilise
l'historique confirmé complet et reste non calculable sans prix, devise ou port. Les prix sont totalisés
séparément par devise pour les pièces éligibles (sans filtrer leurs dates d'achat). Aucun taux de conversion
n'est inventé. L'oubli se calcule depuis le dernier port confirmé connu, ou la création, avec un seuil réglable
(90 jours par défaut) ; aucun état de vêtement n'est modifié.

API : `GET /analytics?from=&to=&forgottenDays=` ; `GET /notifications` (limit/cursor),
`POST /notifications/refresh`, `GET/PUT /notifications/preferences`, `PUT /notifications/{id}/read`,
`DELETE /notifications/{id}`, sous `/api/v1`. Session obligatoire ; CSRF sur écritures ; limites par utilisateur.
Migration additive `20261106090000_notifications` ; bundle worker actualisé avec `pnpm build:worker`.

Limites : 5000 pièces/100000 lignes de port pour les statistiques, 500 tenues à rappeler par compte et
10000 comptes activés par balayage worker (erreurs explicites au-delà). Les notifications d'événements/valises,
Web Push, quiet hours, import/export complet et les parties restantes des plans ne sont pas déclarés livrés.
