# Runbook local — Lookiva (phase 02)

Les versions épinglées sont dans la [matrice de compatibilité](compat-matrix.md) et ne sont pas répétées ici.
Aucune valeur de secret dans ce document : seuls les placeholders `change-me` de `.env.example` existent.

## 1. Démarrer et arrêter l'infrastructure

| Besoin | Commande | Ce que ça fait |
|---|---|---|
| Développer / tester depuis l'hôte | `pnpm infra:up` | `docker compose --env-file .env.example -f compose.yaml -f compose.test.yaml up -d --wait` : db, redis, worker (le worker est construit au premier lancement). L'overlay publie MariaDB sur `127.0.0.1:3307` et Redis sur `127.0.0.1:6380`. |
| Tout arrêter | `pnpm infra:down` | Même fichiers, `down -v` : supprime aussi le volume `db-data`. **Les données locales sont perdues.** |
| Pile complète en conteneurs | `pnpm stack:up` | `--profile app up -d --build --wait` : db, redis, worker et `web` (Next.js standalone, build de production). |
| Arrêter la pile | `pnpm stack:down` | `--profile app down -v` (volumes supprimés). |

Les deux familles (`infra:*` et `stack:*`) utilisent le projet compose par défaut `lookiva` (nom du dossier) : elles partagent donc conteneurs et volume.
Ne lancez pas l'une pendant que l'autre tourne.

### Projet `lookiva-verify`

`pnpm verify` exporte `COMPOSE_PROJECT_NAME=lookiva-verify` et ne démarre/arrête que ce projet pour les tests d'intégration.
Raison : `infra:down` fait `down -v` ; sous un projet distinct, ce nettoyage ne peut jamais supprimer les conteneurs ni le volume `lookiva_db-data` d'une pile de développement.
Au début de chaque `verify`, un reliquat `lookiva-verify` d'un run interrompu est supprimé, puis les ports 3307, 6380 et 3100 sont contrôlés.

### Ce que prouve le profil `app`

`pnpm stack:up` construit les images `worker` et `web` depuis le `Dockerfile` multi-étapes et démarre les quatre services avec healthchecks (`--wait`).
Il prouve que la build de production tourne en conteneur, que `/api/v1/health` et `/api/v1/ready` répondent, que `/fr` pose `lang="fr" dir="ltr"`, que `/fr/dev/ui` répond 404 en production, et que db/redis n'ont aucun port publié sur l'hôte (seul `web` publie `127.0.0.1:3000`).
Il n'applique pas les migrations (la base n'est pas joignable depuis l'hôte) : `/ready` ne fait qu'un ping base + Redis.

## 2. Ports

| Service | Port conteneur | Port hôte | Quand |
|---|---|---|---|
| web (Next.js standalone) | 3000 | `127.0.0.1:${WEB_HOST_PORT}` (3000) | profil `app` uniquement (`stack:up`) |
| db (MariaDB) | 3306 | `127.0.0.1:${DB_HOST_PORT}` (3307) | uniquement avec l'overlay `compose.test.yaml` (`infra:up`, `verify`). Jamais avec `stack:up`. |
| redis | 6379 | `127.0.0.1:${REDIS_HOST_PORT}` (6380) | idem db |
| worker | aucun | aucun | healthcheck interne (fichier `/tmp/worker-alive`) |
| `pnpm dev` | 3000 (process hôte) | `localhost:3000` | développement |
| Playwright (`next dev`) | 3100 (process hôte) | `localhost:3100` | pendant `pnpm test:e2e` |

Tous les ports publiés sont liés à `127.0.0.1` : rien n'est joignable depuis le réseau local. Le réseau compose `internal` est un réseau bridge normal (pas `internal: true`) ; l'absence d'exposition vient de l'absence de `ports:` sur db et redis dans `compose.yaml`, vérifiée par `tests/infra/compose.test.ts`.

## 3. Variables d'environnement

Copier `.env.example` vers `.env` (ignoré par git). Validation Zod au démarrage (`src/platform/env.ts`) : un message d'erreur nomme la variable, jamais sa valeur. Le serveur web la déclenche via `src/instrumentation.ts` (en production le process sort avec le code 1 ; en développement `next dev` journalise l'erreur) et le worker dans `src/worker/main.ts`. Hors démarrage, `withApi` répond quand même une 500 `application/problem+json` si l'environnement est invalide.

| Variable | Sens | Placeholder dans `.env.example` |
|---|---|---|
| `NODE_ENV` | `development`, `test` ou `production` (défaut `development`). | `development` |
| `DATABASE_URL` | URL de connexion MariaDB, côté hôte. | URL locale avec mot de passe `change-me` |
| `REDIS_URL` | URL de connexion Redis, côté hôte. | URL locale `redis://127.0.0.1:6380` |
| `READY_TOKEN` | Jeton Bearer exigé par `GET /api/v1/ready` (401 sinon). | `change-me` |
| `LOG_LEVEL` | `debug`, `info`, `warn` ou `error` (défaut `info`). | `info` |
| `MARIADB_ROOT_PASSWORD` | Mot de passe root du conteneur MariaDB (compose). | `change-me` |
| `MARIADB_DATABASE` | Nom de la base créée par le conteneur. | `lookiva` |
| `MARIADB_USER` | Utilisateur applicatif créé par le conteneur. | `lookiva` |
| `MARIADB_PASSWORD` | Mot de passe de cet utilisateur. | `change-me` |
| `DB_HOST_PORT` | Port hôte loopback de MariaDB (overlay de test). | `3307` |
| `REDIS_HOST_PORT` | Port hôte loopback de Redis (overlay de test). | `6380` |
| `WEB_HOST_PORT` | Port hôte loopback du service `web`. | `3000` |

Compose lit `.env.example` via `--env-file` : les scripts `infra:*` et `stack:*` n'ont pas besoin de `.env`. Dans les conteneurs, `DATABASE_URL` et `REDIS_URL` sont recomposées vers `db:3306` et `redis:6379`.
Les placeholders `change-me` ne servent que le développement local : en production, tout doit être remplacé et injecté hors dépôt (non décidé, voir §8). `READY_TOKEN=change-me` est actuellement accepté même en production (constat reporté).

## 4. Migrations

- Le schéma vit dans `prisma/schema.prisma` ; les migrations versionnées dans `prisma/migrations/`. Il n'y a qu'une migration : `20261028150000_init_idempotency` (table `idempotency_records`).
- `pnpm db:generate` : génère le client dans `src/generated/prisma` (non versionné ; lint, typecheck, build et test:int le relancent).
- `pnpm db:migrate:deploy` : applique les migrations sur la base de `DATABASE_URL` (lue depuis `.env` par `prisma.config.ts`). Avec la configuration par défaut : `pnpm infra:up` puis `pnpm db:migrate:deploy`.
- `pnpm test:int` applique déjà les migrations lui-même (`tests/setup/int-global-setup.ts`).
- **Comment la migration a été produite, sans base fantôme (shadow DB)** : `prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`, relue à la main, puis un seul ajustement manuel (documenté dans le fichier SQL) : collation `utf8mb4_nopad_bin` au lieu de `utf8mb4_unicode_ci`, pour que l'index unique `(userId, key)` soit exact (sensible à la casse, aux accents et aux espaces finaux). `migrate dev` n'est pas utilisé. Toute nouvelle migration suit la même méthode.
- **Retour arrière** (note de la tâche 8) : `DROP TABLE idempotency_records;` annule entièrement la migration (table, index unique, réponses stockées). Aucune clé étrangère, aucune autre table touchée. Conséquence : la protection contre le rejeu est perdue ; supprimer aussi la ligne de `_prisma_migrations` pour pouvoir réappliquer.

## 5. Dépannage

| Symptôme | Cause et action |
|---|---|
| `pnpm verify` : `!! port 3307 is already in use: stop your dev stack or whatever listens on 3307 first` (idem 6380, 3100) | Un process écoute déjà sur ce port, souvent `pnpm infra:up` ou un `next dev` oubliés. L'identifier (`lsof -nP -iTCP:3307 -sTCP:LISTEN`), l'arrêter, relancer. Rien n'a été modifié. Sans `nc` installé, le contrôle ne s'exécute pas correctement (constat reporté). |
| `Cannot connect to the Docker daemon` | Docker Desktop n'est pas lancé. Le démarrer, attendre qu'il soit prêt, relancer. |
| `next dev` créait un `AGENTS.md` à la racine | Désactivé par `agentRules: false` dans `next.config.ts` (option documentée de Next >= 16.3). Ne pas l'ignorer dans `.gitignore` : `plans/AGENTS.md` fait référence à un `AGENTS.md` racine. |
| `/api/v1/health` répond 500 en `pnpm dev` | Variables d'environnement absentes : créer `.env` depuis `.env.example`. |
| pnpm : `ERR_PNPM_IGNORED_BUILDS` ou message `allowBuilds` | pnpm 11/12 bloque les scripts d'installation. La liste autorisée est dans `pnpm-workspace.yaml` (`esbuild`, `unrs-resolver`, `prisma`, `@prisma/engines` à `true` ; `msgpackr-extract`, `@parcel/watcher`, `@swc/core` à `false`, repli JS ou binaires précompilés). Pour une nouvelle dépendance, examiner le script avant de l'ajouter. |
| Playwright : `Executable doesn't exist` (Chromium absent) | `pnpm e2e:install` (Chromium seul ; `verify` le fait aussi). |
| `engines` : avertissement Node | Le pin est >= 24.22.1 (matrice). Une 24.x plus basse avertit seulement ; installer la version épinglée (nvm/fnm avec `.nvmrc`). |
| `pnpm stack:up` lent la première fois | Build Docker des images worker et web. |

## 6. Plan de migration vers la phase 03

1. La phase 03 crée `src/modules/identity/` (et seulement ce dont elle a besoin) avec `domain/`, `application/`, `infrastructure/`, `api/`, `index.ts`. Avant cela, ajouter la règle `dependency-cruiser` qui interdit à `src/app`, `src/ui` et `src/platform` d'importer autre chose que `index.ts` d'un module (constat reporté de la tâche 4).
2. Ajouter les modèles Prisma du module dans `prisma/schema.prisma`, puis générer le SQL avec `prisma migrate diff` (voir §4), relire, committer le dossier de migration. Pas de table vectorielle avant le choix des embeddings (phase 07).
3. Les repositories exigent un `OwnerId` (`src/platform/kernel`) ; les routes passent par `withApi` ; les POST critiques par `readIdempotencyKey` + `withIdempotency` ; les schémas Zod enrichissent `openapi.json` (`pnpm openapi:gen`, puis `pnpm openapi:check`).
4. **Production** : `prisma` est une `devDependency` ; l'installation `--prod` est faite par l'image `worker` seulement, l'image `web` copie la sortie standalone de Next construite depuis une installation complète. Un `prisma migrate deploy` en production demande donc une étape dédiée (job ou image avec le CLI Prisma), non définie en phase 02. Aucun déploiement n'est prévu avant la phase 12 et l'accord du propriétaire.
5. Corps JSON : les modules lisent toujours le corps avec `readJson(req, schema)` (`src/platform/http/body.ts`), jamais `req.json()` directement. Un corps invalide ou vide donne 400 `INVALID_JSON` sans message du parseur (qui citerait un fragment du corps, donc possiblement un mot de passe, et le ferait arriver dans les logs) ; une violation du schéma donne 400 `VALIDATION_ERROR`.
6. Reprises connues à traiter en phase 03 : `READY_TOKEN` placeholder à refuser en production ; `generateMetadata` localisé pour les pages hors `dev/ui` (règle axe `document-title`).

## 7. Documents produit absents

Les plans citent un dossier `docs/` d'origine : registre des décisions, règles métier, ADR, modèle de données, contrats API, critères d'acceptation. **Ce dossier n'existe pas dans ce dépôt.**
Seuls `plans/` (plans 00 à 13 et `AGENTS.md`) et les documents créés en phase 02 sont disponibles. Les « décisions non négociables » des plans servent de base provisoire ; elles ne remplacent pas ce registre.
Recréer ou non ce dossier reste une décision du propriétaire.

## 8. Coûts et fournisseurs ouverts

Aucune dépense n'est engagée à ce jour. Tout ce qui suit est **NON DÉCIDÉ** :

| Poste | Phase | Statut |
|---|---|---|
| Hébergement MariaDB et Redis (hors Compose local) | 12 | NON DÉCIDÉ, aucune dépense engagée |
| Stockage objet compatible S3 (photos) | 04 | NON DÉCIDÉ, aucune dépense engagée |
| Fournisseur d'e-mail transactionnel | 03 | NON DÉCIDÉ, aucune dépense engagée |
| Fournisseur météo | 06 | NON DÉCIDÉ, aucune dépense engagée |
| IA et embeddings (optionnels) | 06-07 | NON DÉCIDÉ, aucune dépense engagée |
| Web Push (clés VAPID) | 09 | NON DÉCIDÉ, aucune dépense engagée |
| VPS OVH, nom de domaine, DNS, TLS, sauvegardes | 12 | NON DÉCIDÉ, aucune dépense engagée |
| Hébergement du code et CI (GitHub, GitLab ou autre) | avant CI | NON DÉCIDÉ (le dépôt est local, sans remote) |

ADR ouverts (aucun n'est approuvé) :

- **ADR-01** : utilisateurs actifs vs simultanés (hypothèse de charge, cible des plans : environ 1 000 actifs).
- **ADR-09** : dimensionnement de l'infrastructure.
- **ADR-10** : choix des fournisseurs ; aucune dépense avant accord.

Aucune décision n'est prise sur la gestion des secrets de production (injection, rotation).
