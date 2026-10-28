# Lookiva

Lookiva est une PWA de dressing privé, multi-utilisateurs, en français, anglais et arabe (RTL).
Ce dépôt contient le socle de la phase 02 : monolithe modulaire Next.js 16 (App Router) avec un worker BullMQ,
Prisma sur MariaDB 11.8, Redis 8, un design system accessible et la commande de contrôle `pnpm verify`.
Aucun module métier ni authentification n'existe encore (phase 03).

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
pnpm infra:down          # arrête et SUPPRIME les volumes (down -v) : la base locale est perdue
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
| `pnpm test:e2e` | Tests Playwright (Chromium : fr, en, ar, mobile) contre `next dev` sur le port 3100. |
| `pnpm e2e:install` | Installe Chromium pour Playwright. |
| `pnpm verify` | Contrôle unique : preflight ports, db:generate, lint, typecheck, boundaries, tests unitaires, intégration (infra dédiée `lookiva-verify`), openapi:check, build, e2e, scan de secrets. S'arrête à la première erreur. |
| `pnpm secrets:scan` | `secretlint` sur tout le dépôt. |
| `pnpm stack:up` | Construit et démarre toute la pile (db, redis, worker, web) avec le profil compose `app`. Seul `web` publie un port (`127.0.0.1:3000`). |
| `pnpm stack:down` | Arrête la pile `app` et supprime ses volumes (`down -v`). |
| `pnpm infra:up` | Démarre db + redis + worker avec l'overlay `compose.test.yaml` qui publie MariaDB et Redis sur loopback (3307, 6380) pour les tests lancés depuis l'hôte. |
| `pnpm infra:down` | Arrête cette infra et supprime ses volumes (`down -v`). |
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
src/modules/     modules métier, créés phase par phase (absent en phase 02 : aucune logique métier)
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
(`.dependency-cruiser.cjs` : `domain-pure`, `no-infra-from-inner`, `module-public-only`, `ui-no-infra`), testées sur des fixtures dans `tests/boundaries`.
Limite connue : aucun module réel n'existe encore, et une règle pour `src/app`, `src/ui` et `src/platform` important les internes d'un module reste à ajouter avant la phase 03.

## Conventions

- Identifiants opaques : UUIDv7 (`newId()`), aucun auto-incrément exposé.
- Temps stockés en UTC.
- Erreurs HTTP : `application/problem+json` (champs `type`, `title`, `status`, `code`, `detail`, `requestId`, `errors[]`), via `withApi`.
- Pagination par curseur (`limit`, `cursor`).
- Corps JSON : toujours `readJson(req, schema)` (`src/platform/http/body.ts`), jamais `req.json()` : 400 `INVALID_JSON` sans message du parseur, 400 `VALIDATION_ERROR` si le schéma échoue.
- Concurrence : ETag faible `W/"v<n>"` et `If-Match` (428 si absent, 409 en conflit).
- Idempotence : en-tête `Idempotency-Key` sur les POST critiques (`withIdempotency`, table `idempotency_records` unique `(userId, key)`).
- Jamais de push (file, notification, webhook) ni de suppression d'objet (stockage) à l'intérieur d'une transaction SQL.
- SQL brut uniquement dans `infrastructure`, toujours paramétré (spec §5).
- Isolation des données : tout repository exige un `OwnerId` en paramètre (type `OwnerId`, oubli = erreur de compilation).
- Les schémas Zod sont la source unique de validation et d'OpenAPI (`openapi.json` versionné, contrôlé par `pnpm openapi:check`).

## i18n et RTL

- Langues `fr` (défaut et repli), `en`, `ar` (`dir="rtl"` posé sur `<html>`). Un fichier de messages par langue dans `src/i18n/messages`.
- CSS logique uniquement (`ms-*`, `ps-*`, `start`, `end`, ...) : pas de `left`/`right`/`ml-`/`pl-`...; un test (`tests/ui/no-physical-css.test.ts`) le fait respecter dans `src/ui` et `src/app`.
- Le texte saisi par l'utilisateur n'est jamais traduit ; dates et nombres passent par `Intl`.

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
