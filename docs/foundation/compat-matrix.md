# Matrice de compatibilité — Phase 02 (socle)

Date de consultation : **2026-10-28**. Toutes les versions viennent de sources officielles consultées ce jour (registre npm, documentation officielle, Docker Hub image officielle, calendrier Node.js). Rien n'est tiré de mémoire. « Version exacte » = version à épingler (sans `^` ni `~`).

## 1. Versions à épingler

| Composant | Version exacte | URL source | Consulté le |
|---|---|---|---|
| Node.js LTS | **24.22.1** (Krypton, Maintenance LTS jusqu'au 2028-04-30) | https://nodejs.org/en/about/previous-releases ; https://raw.githubusercontent.com/nodejs/Release/main/schedule.json | 2026-10-28 |
| Gestionnaire de paquets : pnpm | **12.15.0** (dist-tag `latest`) | https://registry.npmjs.org/-/package/pnpm/dist-tags | 2026-10-28 |
| Next.js | **16.4.3** (`latest`; Node >= 20.9; React ^19) | https://registry.npmjs.org/next/latest ; https://nextjs.org/docs/app/getting-started/installation | 2026-10-28 |
| React / react-dom | **19.3.1** (dans les peers de Next 16.4.3) | https://registry.npmjs.org/react/latest | 2026-10-28 |
| TypeScript | **6.0.3** (volontairement pas 7.0.2, voir note 3) | https://registry.npmjs.org/typescript ; https://registry.npmjs.org/typescript-eslint/latest | 2026-10-28 |
| Prisma CLI (`prisma`) | **7.10.1** (dist-tag `prev` ; `latest` = 8.0.0-rc.28, release candidate, voir note 1) | https://registry.npmjs.org/-/package/prisma/dist-tags ; https://registry.npmjs.org/prisma/7.10.1 | 2026-10-28 |
| `@prisma/client` | **7.10.1** (`latest` ; Node ^20.19 \|\| ^22.12 \|\| >=24.0 ; TS >= 5.4) | https://registry.npmjs.org/@prisma/client/latest ; https://www.prisma.io/docs/orm/reference/system-requirements | 2026-10-28 |
| `@prisma/adapter-mariadb` | **7.10.1** (dépend de `mariadb` 3.5.4) | https://registry.npmjs.org/@prisma/adapter-mariadb/7.10.1 ; https://www.prisma.io/docs/orm/overview/databases/mysql | 2026-10-28 |
| Image MariaDB | **`mariadb:11.8.9`** (image officielle, tag LTS 11.8 ; digest vu : `sha256:c4124d1afa87…a22a9bd`, publiée 2026-10-27) | https://hub.docker.com/v2/repositories/library/mariadb/tags?name=11.8 ; https://hub.docker.com/_/mariadb | 2026-10-28 |
| Redis (image) | **`redis:8.10.3`** | https://github.com/redis/redis/releases/tag/8.10.3 ; https://hub.docker.com/v2/repositories/library/redis/tags | 2026-10-28 |
| BullMQ | **6.5.0** (Redis >= 6.2 requis ; peer optionnel `ioredis` >= 5) | https://registry.npmjs.org/bullmq/latest ; https://docs.bullmq.io/guide/introduction | 2026-10-28 |
| `ioredis` (client Redis de BullMQ) | **6.0.0** (Node >= 20) | https://registry.npmjs.org/ioredis/latest | 2026-10-28 |
| Zod | **4.6.7** | https://registry.npmjs.org/zod/latest | 2026-10-28 |
| Bibliothèque OpenAPI-depuis-Zod | **@asteasolutions/zod-to-openapi 9.1.0** (peer `zod ^4.0.0`) | https://registry.npmjs.org/@asteasolutions/zod-to-openapi/latest | 2026-10-28 |
| Bibliothèque i18n | **next-intl 4.14.9** (peer `next ^16` accepté) | https://registry.npmjs.org/next-intl/latest | 2026-10-28 |
| Primitives UI | **radix-ui 1.8.1** (paquet unifié ; peer React 19 accepté) | https://registry.npmjs.org/radix-ui/latest | 2026-10-28 |
| Tailwind CSS | **4.3.3** (`latest`) | https://registry.npmjs.org/tailwindcss/latest ; https://registry.npmjs.org/-/package/tailwindcss/dist-tags | 2026-10-28 |
| Vitest | **5.0.5** (Node ^22.12 \|\| ^24 \|\| >=26 ; peer `vite` ^6.4 \|\| ^7 \|\| ^8, voir note 4) | https://registry.npmjs.org/vitest/latest | 2026-10-28 |
| Playwright (`@playwright/test`) | **1.64.1** (Node >= 20) | https://registry.npmjs.org/@playwright/test/latest | 2026-10-28 |
| axe-core | **4.14.0** | https://registry.npmjs.org/axe-core/latest | 2026-10-28 |
| `@axe-core/playwright` | **4.14.0** (Node >= 22.12 ; peer `playwright-core` >= 1) | https://registry.npmjs.org/@axe-core/playwright/latest | 2026-10-28 |
| pino | **10.4.0** | https://registry.npmjs.org/pino/latest | 2026-10-28 |
| `uuid` | **14.0.3** | https://registry.npmjs.org/uuid/latest | 2026-10-28 |
| dependency-cruiser | **18.7.0** (Node ^22 \|\| ^24 \|\| >=26) | https://registry.npmjs.org/dependency-cruiser/latest | 2026-10-28 |
| secretlint | **13.1.0** + `@secretlint/secretlint-rule-preset-recommend` **13.1.0** (Node >= 22) | https://registry.npmjs.org/secretlint/latest ; https://registry.npmjs.org/@secretlint/secretlint-rule-preset-recommend/latest | 2026-10-28 |

## 2. Choix avec candidats

| Choix | Décision | Raison (une ligne) |
|---|---|---|
| Gestionnaire de paquets | **pnpm 12.15.0** (version CLI installée localement : 11.22.0, à aligner via `packageManager`/corepack) | Installation stricte et rapide, déjà présent sur la machine, supporté par `create-next-app`; candidats npm/yarn écartés (hoisting laxiste). |
| i18n | **next-intl 4.14.9** | Seul candidat examiné, déclare explicitement Next 16 en peer, App Router natif ; la direction RTL (`dir`) se pose sur `<html>` par locale. |
| Primitives UI | **Radix UI (`radix-ui` 1.8.1)** | Primitives sans style qui se combinent avec Tailwind et les tokens CSS, `DirectionProvider` pour le RTL, un seul paquet ; alternative React Aria Components 1.22.1 écartée (plus lourd, son système de styles est à contourner). |
| OpenAPI depuis Zod | **@asteasolutions/zod-to-openapi 9.1.0** | Registre de routes explicite qui produit un document OpenAPI 3.1, peer Zod 4, aucune contrainte de moteur ; `zod-openapi` 6.0.2 (Node >= 22.14) est l'alternative viable. |
| Node LTS | **24.22.1** | Le site officiel marque v24 « Latest LTS » et v26 « Current » (non LTS à ce jour) ; Prisma 7.10.1 documente Node ^24, Node 26 n'est pas listé dans la doc Prisma. |
| Tailwind | **4.3.3** | Version `latest` stable ; v3 reste en `v3-lts` et la doc Next.js active Tailwind dans le setup par défaut. |
| Prisma | **7.10.1** et non 8 | Prisma 8 est en release candidate et sa page officielle indique « no Prisma ORM 8 library yet » pour MariaDB ; la 7.10.1 est validée par le POC ci-dessous. |

## 3. Notes de compatibilité et points à valider

1. **Prisma** : le dist-tag npm `latest` du CLI `prisma` pointe sur `8.0.0-rc.28` alors que `@prisma/client`, `@prisma/adapter-mariadb` sont en `7.10.1`. Il faut épingler explicitement `prisma@7.10.1` (ne jamais utiliser `latest`). Sources : https://registry.npmjs.org/-/package/prisma/dist-tags ; https://www.prisma.io/docs/orm/reference/supported-databases. La documentation Prisma indique que MariaDB (10.0+ selon https://www.prisma.io/docs/orm/overview/databases/mysql) utilise le provider `mysql` ; le POC confirme MariaDB 11.8.9.
2. **Prisma 7** : la configuration passe par `prisma.config.ts` (`defineConfig`, `datasource.url`), le générateur est `prisma-client` avec `output` obligatoire, et le client est construit avec `new PrismaClient({ adapter: new PrismaMariaDb({...}) })`. Le `.env` n'est plus chargé automatiquement (import `dotenv/config` dans la config).
3. **TypeScript** : 7.0.2 est `latest`, mais `typescript-eslint` 8.72.1 déclare `typescript >=4.8.4 <6.1.0`. On épingle donc **6.0.3** (dernière 6.x) tant que le lint typé ne supporte pas TS 7. Next.js exige TS >= 5.1, Prisma >= 5.4 : 6.0.3 convient. À revérifier en Task 3.
4. **Vitest 5.0.5** : peer `vite` `^6.4 || ^7 || ^8`. À choisir et épingler à la Task 3 (non consulté en détail ici). Le POC a tourné avec Vitest 5.0.5 sur Node 24.11.1 sans installer vite séparément.
5. **pnpm 11+** bloque les scripts de build des dépendances par défaut (`ERR_PNPM_IGNORED_BUILDS`) : `prisma` et `@prisma/engines` doivent être autorisés (`allowBuilds` dans `pnpm-workspace.yaml`, créé par `pnpm approve-builds`). À prévoir dans le squelette du dépôt.
6. **Node local** : la machine a Node v24.11.1 ; on épingle 24.22.1 (`.nvmrc` + `engines`), mise à jour locale à prévoir. Node 26 devient LTS selon le calendrier (https://raw.githubusercontent.com/nodejs/Release/main/schedule.json : passage en LTS le 2026-10-28) mais n'est pas encore marqué LTS sur nodejs.org ni supporté par la doc Prisma : réévaluer plus tard, pas en Phase 02.
7. **Redis** : BullMQ demande Redis >= 6.2 ; `redis:8.10.3` est conforme. Compatibilité fonctionnelle de BullMQ 6.5.0 avec Redis 8 non testée dans ce POC (hors périmètre Task 1, à couvrir par les tests d'intégration).
8. **pino 10.4.0, uuid 14.0.3, Zod 4.6.7, Tailwind 4.3.3, axe-core 4.14.0, Playwright 1.64.1** : aucune contrainte de moteur Node bloquante relevée avec Node 24 ; `@axe-core/playwright` exige Node >= 22.12 (OK).

## 4. POC Prisma + MariaDB 11.8 (jetable, supprimé)

Environnement : Docker 28.3.3, Compose 2.39.1, Node v24.11.1, pnpm 11.22.0, image `mariadb:11.8.9` (`SELECT VERSION()` = `11.8.9-MariaDB-ubu2404`), publiée sur `127.0.0.1` port libre aléatoire, Prisma 7.10.1 + `@prisma/adapter-mariadb` 7.10.1, Vitest 5.0.5. Migration générée par `prisma migrate dev --name init` :

```sql
CREATE TABLE `poc_item` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Le test applique cette migration via `prisma migrate deploy` sur une base vide (`beforeAll`), puis lance les 3 tests : commande `pnpm exec vitest run --reporter=verbose`.

| Test | Résultat |
|---|---|
| `connects_and_applies_migration` | PASS |
| `transaction_rolls_back_on_throw` | PASS |
| `parameterized_raw_query_returns_version` (`SELECT VERSION()` via `$queryRaw` tagué paramétré, commence par `11.8`) | PASS |

Sortie collée :

```
 RUN  v5.0.5 .../poc/prisma-mariadb

1 migration found in prisma/migrations
Applying migration `20261028135337_init`
All migrations have been successfully applied.
 ✓ poc.test.ts > connects_and_applies_migration 43ms
 ✓ poc.test.ts > transaction_rolls_back_on_throw 31ms
 ✓ poc.test.ts > parameterized_raw_query_returns_version 1ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
```

Une seconde exécution (migration déjà appliquée) donne également 3 PASS. Après le POC : `docker compose down -v --remove-orphans`, dossier `poc/` supprimé, aucun conteneur ni volume `lookiva-poc` restant.

## 5. Validation

À valider par l'utilisateur avant la Task 2. Aucune installation n'a été faite à la racine du dépôt.
