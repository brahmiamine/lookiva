# Runbook local — Lookiva (phases 02-03)

Les versions épinglées sont dans la [matrice de compatibilité](compat-matrix.md) et ne sont pas répétées ici.
Aucune valeur de secret dans ce document : seuls les placeholders `change-me` de `.env.example` existent.

## 1. Démarrer et arrêter l'infrastructure

| Besoin | Commande | Ce que ça fait |
|---|---|---|
| Développer / tester depuis l'hôte | `pnpm infra:up` | `docker compose --env-file .env.example -f compose.yaml -f compose.test.yaml up -d --wait` : db, redis, worker (le worker est construit au premier lancement). L'overlay publie MariaDB sur `127.0.0.1:3307` et Redis sur `127.0.0.1:6380`. |
| Tout arrêter | `pnpm infra:down` | Mêmes fichiers, `down` : conteneurs arrêtés, volume `db-data` conservé. |
| Tout effacer | `pnpm infra:reset` | `down -v` : supprime aussi le volume `db-data`. **Les données locales sont perdues.** |
| Pile complète en conteneurs | `pnpm stack:up` | `--profile app up -d --build --wait` : db, redis, worker et `web` (Next.js standalone, build de production). |
| Arrêter la pile | `pnpm stack:down` | `--profile app down` (volumes conservés). `pnpm stack:reset` fait `down -v`. |

Les deux familles (`infra:*` et `stack:*`) utilisent le projet compose par défaut `lookiva` (nom du dossier) : elles partagent donc conteneurs et volume.
Ne lancez pas l'une pendant que l'autre tourne.

### Projet `lookiva-verify`

`pnpm verify` exporte `COMPOSE_PROJECT_NAME=lookiva-verify` et ne démarre/arrête que ce projet pour les tests d'intégration ; son nettoyage utilise `infra:reset` (`down -v`).
Raison : sous un projet distinct, ce nettoyage ne peut jamais supprimer les conteneurs ni le volume `lookiva_db-data` d'une pile de développement.
Avant l'étape d'intégration, `verify` exporte aussi `DATABASE_URL` et `REDIS_URL` lus dans `.env.example` (ports loopback 3307/6380) : un `.env` ou un shell pointant ailleurs ne peut pas détourner les tests.
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
| `TRUST_PROXY` | `true`/`false` (défaut `false`). `true` uniquement derrière exactement un reverse proxy qui ajoute l'adresse du client à `X-Forwarded-For` (voir §9). **En production, `false` est refusé** sauf si `TRUST_PROXY_ACK_SINGLE_BUCKET=true`. | `false` |
| `TRUST_PROXY_ACK_SINGLE_BUCKET` | `true` accepte explicitement, en production, de fonctionner sans proxy de confiance : tous les clients partagent alors UN seul compteur de limite (un attaquant peut bloquer la connexion de tout le monde). Positionné à `true` uniquement pour la pile compose locale. | absent |
| `EMAIL_TRANSPORT` | `outbox` (défaut hors production : e-mails écrits dans la table `outbox_messages`) ou `none` (routes `identity` en 503). En production : obligatoire, `outbox` refusé. | `outbox` |
| `APP_ORIGIN` | Origine publique (`https://hôte[:port]`, sans chemin). **Obligatoire en production et dès que `EMAIL_TRANSPORT` n'est pas `none`** (donc aussi en dev/test avec `outbox`). Seule base des liens envoyés par e-mail (jamais `Host` ni `X-Forwarded-*`, contre l'empoisonnement de lien) et origine attendue du contrôle CSRF. Un `.env` local créé avant la phase 03 doit l'ajouter. | `http://localhost:3000` |
| `STACK_READY_TOKEN` | `READY_TOKEN` des conteneurs `web`/`worker` de compose (ils tournent en `NODE_ENV=production`, avec `EMAIL_TRANSPORT=none`, `APP_ORIGIN=http://localhost:${WEB_HOST_PORT}` et `TRUST_PROXY_ACK_SINGLE_BUCKET=true`). Placeholder public de 32+ caractères : il passe sciemment les règles de production (acceptation documentée, revue M7) et ne doit jamais servir hors poste de dev. | placeholder local |
| `MARIADB_ROOT_PASSWORD` | Mot de passe root du conteneur MariaDB (compose). | `change-me` |
| `MARIADB_DATABASE` | Nom de la base créée par le conteneur. | `lookiva` |
| `MARIADB_USER` | Utilisateur applicatif créé par le conteneur. | `lookiva` |
| `MARIADB_PASSWORD` | Mot de passe de cet utilisateur. | `change-me` |
| `DB_HOST_PORT` | Port hôte loopback de MariaDB (overlay de test). | `3307` |
| `REDIS_HOST_PORT` | Port hôte loopback de Redis (overlay de test). | `6380` |
| `WEB_HOST_PORT` | Port hôte loopback du service `web`. | `3000` |

Compose lit `.env.example` via `--env-file` : les scripts `infra:*` et `stack:*` n'ont pas besoin de `.env`. Dans les conteneurs, `DATABASE_URL` et `REDIS_URL` sont recomposées vers `db:3306` et `redis:6379`.
Les placeholders `change-me` ne servent que le développement local : en production, tout doit être remplacé et injecté hors dépôt (non décidé, voir §8).
Règles supplémentaires en `NODE_ENV=production` : `READY_TOKEN` d'au moins 32 caractères et ne commençant pas par `change-me` ; `EMAIL_TRANSPORT` explicite et différent de `outbox` ; `APP_ORIGIN` défini ; `TRUST_PROXY=true` ou `TRUST_PROXY_ACK_SINGLE_BUCKET=true`. Une valeur vide (`APP_ORIGIN=`) compte comme absente. `DATABASE_URL` doit être en `mysql://` ou `mariadb://`, `REDIS_URL` en `redis://` ou `rediss://` (tous environnements).

## 4. Migrations

- Le schéma vit dans `prisma/schema.prisma` ; les migrations versionnées dans `prisma/migrations/` : `20261028150000_init_idempotency` (table `idempotency_records`) , `20261028210000_identity` (tables `users`, `credentials`, `email_tokens`, `session_registry`, `user_preferences`, `consent_records`, `outbox_messages`) et `20261029090000_email_token_pending_password` (colonne `email_tokens.pendingPasswordHash`) et `20261030090000_account_lifecycle` (tables `deletion_requests`, `export_requests`).
- `pnpm db:generate` : génère le client dans `src/generated/prisma` (non versionné ; lint, typecheck, build et test:int le relancent).
- `pnpm db:migrate:deploy` : applique les migrations sur la base de `DATABASE_URL` (lue depuis `.env` par `prisma.config.ts`). Avec la configuration par défaut : `pnpm infra:up` puis `pnpm db:migrate:deploy`.
- `pnpm test:int` applique déjà les migrations lui-même (`tests/setup/int-global-setup.ts`).
- **Comment les migrations sont produites, sans base fantôme (shadow DB)** : la première avec `prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`, les suivantes avec `--from-schema <schema.prisma précédent>` ; SQL relu à la main, puis un seul ajustement manuel (documenté dans le fichier SQL) : collation `utf8mb4_nopad_bin` au lieu de `utf8mb4_unicode_ci`, pour que l'index unique `(userId, key)` soit exact (sensible à la casse, aux accents et aux espaces finaux). `migrate dev` n'est pas utilisé. Toute nouvelle migration suit la même méthode.
- **Retour arrière `20261030090000_account_lifecycle`** (à faire en premier) : `DROP TABLE deletion_requests, export_requests;` puis `DELETE FROM _prisma_migrations WHERE migration_name = '20261030090000_account_lifecycle';`. Conséquence : demandes d'effacement et d'export perdues. Un compte resté `DELETION_REQUESTED` ne peut plus se connecter : le remettre avant de supprimer la table (`UPDATE users u JOIN deletion_requests d ON d.userId = u.id AND d.status = 'PENDING' SET u.status = d.previousStatus;`). Les deux tables utilisent `utf8mb4_nopad_bin` (clés étrangères vers `users`, `ON DELETE CASCADE`).
- **Retour arrière `20261029090000_email_token_pending_password`** : `ALTER TABLE email_tokens DROP COLUMN pendingPasswordHash;` puis `DELETE FROM _prisma_migrations WHERE migration_name = '20261029090000_email_token_pending_password';` (à faire avant le retour arrière de `20261028210000_identity`). Conséquence : les mots de passe en attente sont perdus, ces comptes gardent le mot de passe de leur première inscription.
- **Retour arrière `20261028210000_identity`** : `DROP TABLE consent_records, user_preferences, session_registry, email_tokens, credentials, outbox_messages, users;` puis `DELETE FROM _prisma_migrations WHERE migration_name = '20261028210000_identity';` (commande aussi en tête du fichier SQL). Toutes les clés étrangères pointent vers `users` (ON DELETE CASCADE) ; aucune autre table n'est touchée. Conséquence : comptes, sessions, jetons en attente et préférences perdus.
- **Retour arrière `20261028150000_init_idempotency`** (note de la tâche 8) : `DROP TABLE idempotency_records;` annule entièrement la migration (table, index unique, réponses stockées). Aucune clé étrangère, aucune autre table touchée. Conséquence : la protection contre le rejeu est perdue ; supprimer aussi la ligne de `_prisma_migrations` pour pouvoir réappliquer.

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

1. La phase 03 crée `src/modules/identity/` (et seulement ce dont elle a besoin) avec `domain/`, `application/`, `infrastructure/`, `api/`, `index.ts`. La règle `dependency-cruiser` `external-module-public-only` (tout fichier hors `src/modules` n'importe un module que par son `index.ts`), `platform-no-modules` et `kernel-pure` existent déjà (étape 0 de la phase 03).
2. Ajouter les modèles Prisma du module dans `prisma/schema.prisma`, puis générer le SQL avec `prisma migrate diff` (voir §4), relire, committer le dossier de migration. Pas de table vectorielle avant le choix des embeddings (phase 07).
3. Les repositories exigent un `OwnerId` (`src/platform/kernel`) ; les routes passent par `withApi` ; les POST critiques par `readIdempotencyKey` + `withIdempotency` ; les schémas Zod enrichissent `openapi.json` (`pnpm openapi:gen`, puis `pnpm openapi:check`).
4. **Production** : `prisma` est une `devDependency` ; l'installation `--prod` est faite par l'image `worker` seulement, l'image `web` copie la sortie standalone de Next construite depuis une installation complète. Un `prisma migrate deploy` en production demande donc une étape dédiée (job ou image avec le CLI Prisma), non définie en phase 02. Aucun déploiement n'est prévu avant la phase 12 et l'accord du propriétaire.
5. Corps JSON : les modules lisent toujours le corps avec `readJson(req, schema)` (`src/platform/http/body.ts`), jamais `req.json()` directement. Un corps invalide ou vide donne 400 `INVALID_JSON` sans message du parseur (qui citerait un fragment du corps, donc possiblement un mot de passe, et le ferait arriver dans les logs) ; une violation du schéma donne 400 `VALIDATION_ERROR`.
6. Reprises connues : `READY_TOKEN` placeholder refusé en production (fait, phase 03 tranche 1) ; `generateMetadata` localisé pour les pages hors `dev/ui` (règle axe `document-title`, tranche 2).

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
| Fournisseur d'e-mail transactionnel | 03 | NON DÉCIDÉ, aucune dépense engagée (seuls `outbox` en dev/test et `none` existent ; en production l'inscription répond 503) |
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

## 9. Identité : sessions, CSRF, limites, e-mails

Toutes les durées sont dans `src/modules/identity/domain/policy.ts`.

- **Corps JSON** : `readJson` refuse tout corps de plus de 16 Kio par 413 `PAYLOAD_TOO_LARGE` (d'après `Content-Length`, puis en comptant les octets lus : un `Content-Length` mensonger ne contourne pas la limite), sans jamais renvoyer le contenu.
- **Sessions** : jeton aléatoire de 256 bits (base64url) dans le cookie `lookiva_session` (`HttpOnly; SameSite=Lax; Path=/; Max-Age=90 j`, `Secure` en production seulement). La base ne stocke que son SHA-256 (`session_registry.tokenHash`). Chaque requête privée relit la session : inconnue, révoquée, inactive depuis 30 jours (glissant ; `lastSeenAt` écrit au plus toutes les 5 min) ou âgée de 90 jours (absolu) => 401 `UNAUTHENTICATED`. L'utilisateur doit être `ACTIVE` et vérifié. Révocation immédiate : `logout`, `logout-all`, `DELETE /me/sessions/{id}`, et réinitialisation du mot de passe (toutes les sessions). Une session créée avant le dernier changement de mot de passe (`credentials.updatedAt`) est refusée. La création d'une session reverrouille la ligne `credentials` (`SELECT ... FOR UPDATE`) et vérifie que le hash est toujours celui contrôlé : une connexion avec l'ancien mot de passe qui croise une réinitialisation n'obtient pas de session.
- **Mots de passe** : scrypt N=2^15, r=8, p=1, sel 16 octets, clé 64 octets, format `scrypt$N$r$p$sel$hash` ; comparaison `timingSafeEqual` ; rehachage à la connexion si les paramètres changent (compare-and-set sur l'ancien hash, `updatedAt` inchangé : ce n'est pas un changement de mot de passe et il ne peut jamais annuler une réinitialisation). Un hash dont les paramètres dépassent N=2^15, r=8, p=1 ou invalide n'est jamais calculé et ne correspond jamais. Politique : 12 à 128 points de code Unicode, pas de règle de composition, liste de 117 mots de passe courants, différent de la partie locale de l'e-mail. Un e-mail inconnu au login exécute quand même un scrypt (temps de réponse comparable).
- **E-mails et jetons** : jetons de 256 bits, seul le SHA-256 est stocké (`email_tokens`), vérification 24 h, réinitialisation 1 h, usage unique garanti par `UPDATE ... WHERE usedAt IS NULL` (sur N utilisations simultanées, une seule réussit). Un nouvel envoi annule les liens précédents du même type ; 60 s minimum entre deux envois (renvoi, mot de passe oublié). La réinitialisation n'aboutit que pour un compte `ACTIVE`.
- **Mot de passe en attente (anti-détournement avant inscription)** — ce que fait le code :
  - La première inscription crée le compte avec son mot de passe dans `credentials` ET le recopie (hash scrypt) sur son lien de vérification (`email_tokens.pendingPasswordHash`). Aucune connexion n'est possible tant que l'adresse n'est pas vérifiée (403 `EMAIL_NOT_VERIFIED`).
  - Toute nouvelle inscription sur une adresse NON vérifiée émet un nouveau lien portant le hash de son propre mot de passe (sans cooldown ; bornée par 5/h par IP et 5/h par adresse e-mail) et annule les liens précédents (`usedAt` posé, hash effacé).
  - « Renvoyer le lien » émet un lien qui hérite du hash du dernier lien non utilisé qu'il annule (jamais `null` si une inscription en attente existait) : un renvoi ne peut pas rétablir le mot de passe du premier inscrit.
  - Ouvrir un lien de vérification : le jeton est consommé, son hash effacé ; le hash n'est écrit dans `credentials` que si cette ouverture fait passer le compte de « non vérifié » à « vérifié ». Un compte déjà vérifié n'est jamais modifié par un lien.
  - Une réinitialisation de mot de passe annule tous les liens de vérification encore valides (et efface leurs hash) dans la même transaction : un vieux lien ne peut pas écraser le mot de passe choisi.
  - Les jetons utilisés ou expirés de plus de 7 jours sont à purger par `purgeEmailTokens(db, olderThan, now)` (exporté par `@/modules/identity`, tâche worker à planifier — voir limites connues).
  - **Limite résiduelle** : un attaquant qui se réinscrit après le titulaire et avant que celui-ci clique possède le lien le plus récent ; si le titulaire ouvre ce lien, le compte est vérifié avec le mot de passe de l'attaquant. Le titulaire s'en aperçoit à la connexion et récupère le compte par « mot de passe oublié » (toutes les sessions révoquées). Conception plus forte prévue avec l'interface (tranche 2) : mot de passe saisi sur la page de vérification, ou lien lié au navigateur qui a fait l'inscription.
- **Jetons** : Inconnu, utilisé ou expiré : même 400 `INVALID_TOKEN`. Les liens portent le jeton dans le fragment (`/<langue>/verify-email#token=...`, `/<langue>/reset-password#token=...`) : il n'est jamais envoyé à un serveur ni dans un `Referer`. Les pages correspondantes arrivent en tranche 2.
- **Liens** : toujours `APP_ORIGIN` + `/<langue>/...` ; ni `Host` ni `X-Forwarded-Proto/Host` n'entrent dans un lien (test `forged_host_and_forwarded_proto_do_not_reach_the_mailed_link`).
- **Lire les e-mails en dev/test** : avec `EMAIL_TRANSPORT=outbox`, les messages sont dans la table `outbox_messages`. Dans un test : `readOutbox(db, 'adresse@exemple')` (`src/platform/email/outbox.ts`, refuse de s'exécuter en production, aucune route HTTP). À la main : `docker compose --env-file .env.example exec db mariadb -ulookiva -pchange-me lookiva -e 'SELECT text FROM outbox_messages ORDER BY id DESC LIMIT 1'`.
- **CSRF** : sur POST/PUT/PATCH/DELETE de toutes les routes `identity` (publiques comprises, contre le « login CSRF ») : en-tête `X-Requested-With: lookiva` obligatoire et, si `Origin` est présent, il doit valoir `APP_ORIGIN` (repli `Host` + schéma seulement si `APP_ORIGIN` est absent, cas `EMAIL_TRANSPORT=none` hors production). Sinon 403 `CSRF_REJECTED`.
- **Limites de débit** (Redis, fenêtre fixe, `INCR` + `PEXPIRE` dans un `MULTI`, 429 `RATE_LIMITED` + `Retry-After`) : login 10 / 15 min par IP+e-mail et 30 / 15 min par IP ; inscription 5 / h par IP et 5 / h par adresse e-mail (hash, quelle que soit l'IP) ; mot de passe oublié et renvoi de vérification 5 / h par IP+e-mail ; jetons (vérification et réinitialisation, compteur commun) 10 / 15 min par IP. L'e-mail entre dans la clé sous forme de SHA-256 tronqué ; une adresse IPv6 compte pour son préfixe /64 (une IPv4 mappée `::ffff:a.b.c.d` pour l'IPv4). La limite par IP du login est appliquée avant la lecture du corps. Redis indisponible : 503 `RATE_LIMITER_UNAVAILABLE` (fermé par défaut). **Adresse client** : les route handlers ne voient pas la socket ; `X-Forwarded-For` n'est lu que si `TRUST_PROXY=true`, et alors seule l'entrée la plus à droite (celle écrite par notre proxy) compte. Avec `TRUST_PROXY=false`, toutes les requêtes partagent l'adresse `untrusted` : les limites par IP deviennent globales. C'est accepté en dev ; en production l'environnement est refusé sauf `TRUST_PROXY=true` ou acquittement explicite `TRUST_PROXY_ACK_SINGLE_BUCKET=true`.
- **Anti-énumération** : inscription, renvoi et mot de passe oublié répondent 202 `{"status":"accepted"}` que le compte existe ou non ; l'inscription calcule toujours un scrypt. Écart résiduel : un compte existant déclenche une écriture de jeton et un e-mail (quelques millisecondes).
- **Idempotence** (`Idempotency-Key` sur register, forgot, reset) : portée anonyme `anon:<sha256(objet, e-mail ou hash du jeton)>` dans `idempotency_records`. Le mot de passe n'entre jamais dans `requestHash` : un rejeu avec la même clé et un autre mot de passe reçoit la première réponse.
- **Audit** : `LogAudit` écrit une ligne `msg: "audit"` par événement (`identity.registered`, `email_verified`, `login`, `logout`, `logout_all`, `session_revoked`, `password_reset_requested`, `password_reset`, `preferences_updated`, `onboarding_completed`, `account_deactivated`, `deletion_requested`, `deletion_cancelled`, `export_requested`, `consent_recorded`) avec l'identifiant utilisateur seulement, jamais d'e-mail.
- **Consentements** : chaque bascule de `aiEnabled` ou `learningEnabled` ajoute une ligne `consent_records` (`AI` / `LEARNING`, `granted`). Les deux sont `false` par défaut.
- **Cycle de vie du compte (préparatoire, plans/03 T10)** : `deactivate` et `deletion-request` exigent le mot de passe courant ; budget dédié `reauth:user` (5 essais / 15 min / utilisateur, essais réussis compris) et réponse 401 `INVALID_CREDENTIALS` générique. Une demande d'effacement met le compte en `DELETION_REQUESTED`, révoque toutes les sessions et enregistre une ligne `DeletionRequest` (`PENDING`, `previousStatus`, `requestedAt`) ; répétée, elle renvoie la même demande (verrou de ligne sur `users`). Comme toutes les sessions sont révoquées, l'annulation (`DELETE /me/deletion-request`) n'a pas de session : elle prouve le compte par e-mail + mot de passe avec les limites de `login` et rétablit `previousStatus`. **Rien n'est purgé ni exporté** : la réponse 202 dit que les sauvegardes ne sont pas purgées immédiatement ; `ExportRequest` ne fait qu'enregistrer la demande (3/jour/utilisateur).
- **Consentements** : types `AI_RECOMMENDATIONS`, `LEARNING`, `CLOUD_BACKGROUND_REMOVAL` (`domain/consents.ts`). `PUT /me/consents/{kind}` ajoute toujours une ligne (historique) et, pour les deux premiers, met `aiEnabled`/`learningEnabled` à jour dans la même transaction (la version des préférences n'augmente que si la valeur change). Le basculement via `PATCH /me/preferences` enregistre aussi `AI_RECOMMENDATIONS` (ancien libellé `AI` pour les lignes déjà écrites en dev : ignorées à la lecture). Aucun type ne couvre la reconnaissance de photos : les photos ne vont jamais à une IA (`tests/identity/consents.test.ts`).
- **Géocodage** : `Geocoder` (`src/platform/geocoder`) avec un faux déterministe (26 villes, noms fr/en/ar, fuseaux IANA). `GET /geo/cities` : session obligatoire, 30/min/utilisateur, `q` jamais journalisé.
- **Transport e-mail absent** (`EMAIL_TRANSPORT=none`, cas des conteneurs compose) : toutes les routes `identity` répondent 503 `EMAIL_TRANSPORT_UNAVAILABLE` avant toute écriture.

## 10. Limites connues (registre)

| Réf. | Limite | Statut |
|---|---|---|
| I2 résiduel | Réinscription d'un attaquant entre l'inscription du titulaire et son clic (voir §9). | Accepté pour la tranche 1 ; conception plus forte en tranche 2 (UI). |
| N4 | `purgeEmailTokens` existe et est testé mais n'est pas encore planifié dans le worker. | À brancher avec les premiers jobs worker. |
| N6 | Constat de la revue de sécurité (re-revue phase 03 tranche 1), accepté par le coordinateur ; description détaillée dans le rapport de revue. | Accepté, non corrigé. |
| N7 | Idem N6. | Accepté, non corrigé. |
| M1, M2, M5, M8, M11, M12 | Constats de la première revue de sécurité, reportés. | Reportés. |
| `forgot` / `resend` | Pas de limite « IP seule » : leur corps est lu avant la limite IP+e-mail. | Accepté (corps plafonné à 16 Kio). |
| Géocodage | Seul le faux géocodeur (26 villes) existe ; le choix du fournisseur externe (coût, données envoyées, licence) est une décision ouverte de la phase 06. En attendant, la saisie manuelle avec fuseau IANA explicite couvre les autres villes. | Ouvert, phase 06. |
| Cycle de vie du compte | Ni purge ni génération d'export : seules les demandes sont enregistrées ; les sauvegardes ne sont pas purgées. Pas de réactivation d'un compte `DISABLED`. L'annulation d'effacement exige e-mail + mot de passe (aucune session). | Préparatoire (T10) ; traitement et réactivation à concevoir avant toute promesse d'effacement. |
| Consentements | Les lignes `ConsentRecord` écrites avant la tranche 2a avec le type `AI` ne sont pas lues (aucune donnée réelle). | Accepté. |
