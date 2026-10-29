# Matrice de compatibilité — Phase 02 (socle)

Date de consultation : **2026-10-28**. Toutes les versions viennent de sources officielles consultées ce jour (registre npm, documentation officielle, Docker Hub image officielle, calendrier Node.js). Rien n'est tiré de mémoire. « Version exacte » = version à épingler (sans `^` ni `~`).

## 1. Versions à épingler

| Composant | Version exacte | URL source | Consulté le | Vérifié par |
|---|---|---|---|---|
| Node.js LTS | **24.22.1** (Krypton, Maintenance LTS jusqu'au 2028-04-30) | https://nodejs.org/en/about/previous-releases ; https://raw.githubusercontent.com/nodejs/Release/main/schedule.json | 2026-10-28 | Registre/doc seulement (essais faits sur Node 24.11.1, pas 24.22.1) |
| Gestionnaire de paquets : pnpm | **12.15.0** (dist-tag `latest`) | https://registry.npmjs.org/-/package/pnpm/dist-tags | 2026-10-28 | V2 (pnpm 12.15.0 : install, allowBuilds) ; POC sur pnpm 11.22.0 |
| Next.js | **16.4.3** (`latest`; Node >= 20.9; React ^19) | https://registry.npmjs.org/next/latest ; https://nextjs.org/docs/app/getting-started/installation | 2026-10-28 | V2 (`next build` OK) |
| React / react-dom | **19.3.1** (dans les peers de Next 16.4.3) | https://registry.npmjs.org/react/latest | 2026-10-28 | V2 (`next build` OK) |
| TypeScript | **6.0.3** (volontairement pas 7.0.2, voir note 3) | https://registry.npmjs.org/typescript ; https://registry.npmjs.org/typescript-eslint/latest | 2026-10-28 | POC + V2 (`tsc --version` 6.0.3, build Next, typescript-eslint) |
| ESLint | **10.13.0** (Node ^20.19 \|\| ^22.13 \|\| >=24) | https://registry.npmjs.org/eslint/latest | 2026-10-28 | V2 (`eslint lint.ts` exit 0 avec config typescript-eslint `recommended` ; `eslint-config-next` 16.4.3 non testé, Task 3) |
| typescript-eslint | **8.72.1** (peer `typescript >=4.8.4 <6.1.0`, `eslint ^8.57 \|\| ^9 \|\| ^10`) | https://registry.npmjs.org/typescript-eslint/latest | 2026-10-28 | V2 (exécuté avec TS 6.0.3 et ESLint 10.13.0) |
| Prisma CLI (`prisma`) | **7.10.1** (dist-tag `prev` ; `latest` = 8.0.0-rc.28, release candidate, voir note 1) | https://registry.npmjs.org/-/package/prisma/dist-tags ; https://registry.npmjs.org/prisma/7.10.1 | 2026-10-28 | POC (migrate dev/deploy) |
| `@prisma/client` | **7.10.1** (`latest` ; Node ^20.19 \|\| ^22.12 \|\| >=24.0 ; TS >= 5.4) | https://registry.npmjs.org/@prisma/client/latest ; https://www.prisma.io/docs/orm/reference/system-requirements | 2026-10-28 | POC (3 tests) |
| `@prisma/adapter-mariadb` | **7.10.1** (dépend de `mariadb` 3.5.4) | https://registry.npmjs.org/@prisma/adapter-mariadb/7.10.1 ; https://www.prisma.io/docs/orm/overview/databases/mysql | 2026-10-28 | POC (3 tests) |
| Image MariaDB | **`mariadb:11.8.9`** (image officielle, tag LTS 11.8 ; digest vu : `sha256:c4124d1afa87…a22a9bd`, publiée 2026-10-27) | https://hub.docker.com/v2/repositories/library/mariadb/tags?name=11.8 ; https://hub.docker.com/_/mariadb | 2026-10-28 | POC (conteneur 11.8.9 exécuté) |
| Redis (image) | **`redis:8.10.3`** | https://github.com/redis/redis/releases/tag/8.10.3 ; https://hub.docker.com/v2/repositories/library/redis/tags | 2026-10-28 | Registre/doc seulement |
| BullMQ | **6.5.0** (Redis >= 6.2 requis ; peer optionnel `ioredis` >= 5) | https://registry.npmjs.org/bullmq/latest ; https://docs.bullmq.io/guide/introduction | 2026-10-28 | Registre/doc seulement |
| `ioredis` (client Redis de BullMQ) | **6.0.0** (Node >= 20) | https://registry.npmjs.org/ioredis/latest | 2026-10-28 | Registre/doc seulement |
| Zod | **4.6.7** | https://registry.npmjs.org/zod/latest | 2026-10-28 | V2 (smoke test) |
| Bibliothèque OpenAPI-depuis-Zod | **@asteasolutions/zod-to-openapi 9.1.0** (peer `zod ^4.0.0`) | https://registry.npmjs.org/@asteasolutions/zod-to-openapi/latest | 2026-10-28 | V2 (document OpenAPI 3.1 généré) |
| Bibliothèque i18n | **next-intl 4.14.9** (peer `next ^16` accepté) | https://registry.npmjs.org/next-intl/latest | 2026-10-28 | V2 (import seulement, pas de rendu Next) |
| Primitives UI | **radix-ui 1.8.1** (paquet unifié ; peer React 19 accepté) | https://registry.npmjs.org/radix-ui/latest | 2026-10-28 | V2 (import seulement, pas de rendu) |
| Tailwind CSS | **4.3.3** (`latest`) | https://registry.npmjs.org/tailwindcss/latest ; https://registry.npmjs.org/-/package/tailwindcss/dist-tags | 2026-10-28 | V2 (`next build`, classe `text-2xl` présente dans le CSS émis) |
| `@tailwindcss/postcss` (plugin PostCSS requis par Tailwind 4 avec Next) | **4.3.3** (aligné sur `tailwindcss`) | https://registry.npmjs.org/@tailwindcss/postcss/latest | 2026-10-28 | V2 (`postcss.config.mjs`, `next build` OK ; `postcss` arrive en dépendance, 8.5.32 installé) |
| Vitest | **5.0.5** (Node ^22.12 \|\| ^24 \|\| >=26 ; peer `vite` ^6.4 \|\| ^7 \|\| ^8, voir note 4) | https://registry.npmjs.org/vitest/latest | 2026-10-28 | POC + V2 (avec vite 8.3.5) |
| jsdom (environnement DOM des tests de composants, via docblock `@vitest-environment jsdom`) | **30.1.3** (`latest`) | https://registry.npmjs.org/jsdom/latest | 2026-10-28 | `npm view jsdom version` = 30.1.3 ; `pnpm add -D jsdom@30.1.3` ; `tests/ui/components.test.tsx` PASS (Radix Dialog : focus, Escape) avec 4 polyfills dans `tests/setup/dom-polyfills.ts` |
| `@testing-library/react` | **16.3.3** (peers `react ^18 \|\| ^19`, `@testing-library/dom ^10`) | https://registry.npmjs.org/@testing-library/react/latest | 2026-10-28 | `npm view @testing-library/react version peerDependencies` ; `pnpm add -D` ; `tests/ui/components.test.tsx` PASS avec React 19.3.1 |
| `@testing-library/dom` (peer requis de `@testing-library/react`) | **10.4.2** | https://registry.npmjs.org/@testing-library/dom/latest | 2026-10-28 | `npm view @testing-library/dom version` ; `pnpm add -D` ; requêtes `getByRole`/`getByLabelText` exécutées |
| `@testing-library/user-event` | **14.6.8** | https://registry.npmjs.org/@testing-library/user-event/latest | 2026-10-28 | `npm view @testing-library/user-event version` ; `pnpm add -D` ; `user.tab()`/`{Escape}` exécutés dans le test du Dialog |
| vite (peer de Vitest) | **8.3.5** (peer Vitest 5.0.5 : `^6.4 \|\| ^7 \|\| ^8`) | https://registry.npmjs.org/vite/latest ; https://registry.npmjs.org/vitest/5.0.5 | 2026-10-28 | V2 (`vitest run` 1 test PASS avec vite 8.3.5) |
| Playwright (`@playwright/test`) | **1.64.1** (Node >= 20) | https://registry.npmjs.org/@playwright/test/latest | 2026-10-28 | `pnpm add -D -E` ; `pnpm test:e2e` : 21 PASS + 3 skip sur 4 projets Chromium (`next dev` port 3100), exécuté 2 fois |
| axe-core | **4.14.0** | https://registry.npmjs.org/axe-core/latest | 2026-10-28 | `pnpm add -D -E` ; `axe_has_no_violations_on_dev_ui` (wcag2a/aa, 21a/aa, 22aa) 0 violation sur fr/en/ar/mobile |
| `@axe-core/playwright` | **4.14.0** (Node >= 22.12 ; peer `playwright-core` >= 1) | https://registry.npmjs.org/@axe-core/playwright/latest | 2026-10-28 | `pnpm add -D -E` ; `AxeBuilder` exécuté dans `e2e/dev-ui.spec.ts` avec Playwright 1.64.1 |
| pino | **10.4.0** | https://registry.npmjs.org/pino/latest | 2026-10-28 | V2 (import seulement) |
| `sharp` (décodage/redimensionnement des photos, tranche 4b) | **0.35.5** (binaires précompilés `@img/sharp-*`, libvips 8.18.7 ; aucun script de build à autoriser dans `allowBuilds` ; décodeur HEVC absent donc HEIC refusé) | https://registry.npmjs.org/sharp/latest | 2026-11-01 | `pnpm add -E` ; tests `photo-processing` (EXIF/GPS retirés, orientation, bombe de pixels) |
| `uuid` | **14.0.3** | https://registry.npmjs.org/uuid/latest | 2026-10-28 | V2 (`v7()` exécuté) |
| dependency-cruiser | **18.7.0** (Node ^22 \|\| ^24 \|\| >=26) | https://registry.npmjs.org/dependency-cruiser/latest | 2026-10-28 | Registre/doc seulement |
| secretlint | **13.1.0** + `@secretlint/secretlint-rule-preset-recommend` **13.1.0** (Node >= 22) | https://registry.npmjs.org/secretlint/latest ; https://registry.npmjs.org/@secretlint/secretlint-rule-preset-recommend/latest | 2026-10-28 | `npm view secretlint version engines.node` = 13.1.0 / >=22 (idem preset) ; `pnpm add -D -E` des deux ; config `.secretlintrc.json` (preset + `enableIDScanRule: true` sur la règle AWS, car l'ID de clé `AKIA…` n'est PAS scanné par défaut : sans l'option, une clé factice sort en code 0) ; `pnpm secrets:scan` (`secretlint "**/*"`, respecte `.gitignore` depuis v13 + `.secretlintignore`) exit 0 sur le dépôt ; `tests/verify/secret-scan.test.ts` PASS (clé factice → exit 1, `.env.example` → exit 0) |
| esbuild (bundle du worker) | **0.28.2** (`latest` ; Node >= 18) | https://registry.npmjs.org/esbuild/latest | 2026-10-28 | `npm view esbuild version` = 0.28.2 et `curl https://registry.npmjs.org/esbuild/latest` (version 0.28.2, engines node >=18) ; `pnpm build:worker` produit `dist/worker.js` ; build Docker de la cible `worker` (Node 24 slim) |

## 2. Choix avec candidats

| Choix | Décision | Raison (une ligne) |
|---|---|---|
| Gestionnaire de paquets | **pnpm 12.15.0** (installé localement : 11.22.0, à aligner via `packageManager`/corepack ; comportement `allowBuilds` vérifié sur 12.15.0, voir section 6) | Installation stricte et rapide, déjà présent sur la machine, supporté par `create-next-app`; candidats npm/yarn écartés (hoisting laxiste). |
| i18n | **next-intl 4.14.9** | Seul candidat examiné, déclare explicitement Next 16 en peer, App Router natif ; la direction RTL (`dir`) se pose sur `<html>` par locale. |
| Primitives UI | **Radix UI (`radix-ui` 1.8.1)** | Primitives sans style qui se combinent avec Tailwind et les tokens CSS, `DirectionProvider` pour le RTL, un seul paquet ; alternative React Aria Components 1.22.1 écartée (plus lourd, son système de styles est à contourner). |
| OpenAPI depuis Zod | **@asteasolutions/zod-to-openapi 9.1.0** | Registre de routes explicite qui produit un document OpenAPI 3.1, peer Zod 4, aucune contrainte de moteur ; `zod-openapi` 6.0.2 (Node >= 22.14) est l'alternative viable. |
| Node LTS | **24.22.1** | Le site officiel marque v24 « Latest LTS » et v26 « Current » (non LTS à ce jour) ; Prisma 7.10.1 documente Node ^24, Node 26 n'est pas listé dans la doc Prisma. |
| Tailwind | **4.3.3** | Version `latest` du registre (v3 reste en `v3-lts`) ; avec Next elle exige le plugin `@tailwindcss/postcss` 4.3.3, épinglé ci-dessus et vérifié par un `next build`. |
| Prisma | **7.10.1** et non 8 | Prisma 8 est en release candidate et sa page officielle indique « no Prisma ORM 8 library yet » pour MariaDB ; la 7.10.1 est validée par le POC ci-dessous. |

## 3. Notes de compatibilité et points à valider

1. **Prisma** : le dist-tag npm `latest` du CLI `prisma` pointe sur `8.0.0-rc.28` alors que `@prisma/client`, `@prisma/adapter-mariadb` sont en `7.10.1`. Il faut épingler explicitement `prisma@7.10.1` (ne jamais utiliser `latest`). Sources : https://registry.npmjs.org/-/package/prisma/dist-tags ; https://www.prisma.io/docs/orm/reference/supported-databases. La documentation Prisma indique que MariaDB (10.0+ selon https://www.prisma.io/docs/orm/overview/databases/mysql) utilise le provider `mysql` ; le POC confirme MariaDB 11.8.9.
2. **Prisma 7** : la configuration passe par `prisma.config.ts` (`defineConfig`, `datasource.url`), le générateur est `prisma-client` avec `output` obligatoire, et le client est construit avec `new PrismaClient({ adapter: new PrismaMariaDb({...}) })`. Le `.env` n'est plus chargé automatiquement (import `dotenv/config` dans la config).
3. **TypeScript** : 7.0.2 est `latest`, mais `typescript-eslint` 8.72.1 déclare `typescript >=4.8.4 <6.1.0`. On épingle donc **6.0.3** (dernière 6.x) tant que le lint typé ne supporte pas TS 7. Next.js exige TS >= 5.1, Prisma >= 5.4 : 6.0.3 convient. Vérifié en section 6 : `tsc` 6.0.3, `next build` 16.4.3 et `eslint` 10.13.0 + typescript-eslint 8.72.1 fonctionnent ensemble ; `eslint-config-next` non testé, à revérifier en Task 3. ESLint et typescript-eslint ont maintenant leurs lignes dans la table.
4. **Vitest 5.0.5** : peer `vite` `^6.4 || ^7 || ^8`. Résolu : **vite 8.3.5** (`latest`, dans `^8`), épinglé en table et vérifié par un `vitest run` (section 6). Le POC avait tourné avec le vite que pnpm avait résolu seul ; il est désormais épinglé explicitement.
5. **pnpm 11 et 12** bloquent les scripts de build des dépendances par défaut (`ERR_PNPM_IGNORED_BUILDS`) : `prisma` et `@prisma/engines` doivent être autorisés (`allowBuilds` dans `pnpm-workspace.yaml`, créé par `pnpm approve-builds`). Vérifié sur pnpm 11.22.0 (POC) et pnpm 12.15.0 (section 6) : même erreur, même correctif. Avec `next-intl` 4.14.9, `@parcel/watcher` 2.6.0 et `@swc/core` 1.16.20 demandent aussi une autorisation de build ; la liste `allowBuilds` définitive est à arrêter en Task 2. À prévoir dans le squelette du dépôt.
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

## 5. Légende de la colonne « Vérifié par »

- **POC** : exécuté dans le POC Prisma + MariaDB (section 4), sur pnpm 11.22.0 et Node v24.11.1.
- **V2** : exécuté dans un dossier jetable hors dépôt avec **pnpm 12.15.0** (section 6), Node v24.11.1.
- **Registre/doc seulement** : seules les métadonnées (version, moteurs, peers) ont été lues ; rien n'a été exécuté. Ces lignes restent à valider à la tâche qui les utilise.

## 6. Vérification complémentaire sur pnpm 12.15.0 (revue 1)

Dossier jetable sous le répertoire temporaire de la session, hors dépôt, supprimé ensuite. Docker non utilisé. `CI=1` ; pnpm lancé par `npx -y pnpm@12.15.0`.

```
$ pnpm --version
12.15.0
$ pnpm add next@16.4.3 react@19.3.1 react-dom@19.3.1 tailwindcss@4.3.3 @tailwindcss/postcss@4.3.3 prisma@7.10.1 @prisma/client@7.10.1
...
Error: ERR_PNPM_IGNORED_BUILDS
  × adding a new package
  ╰─▶ Ignored build scripts: @prisma/engines@7.10.1, prisma@7.10.1
$ pnpm approve-builds --all
.../node_modules/@prisma/engines postinstall: Done
.../node_modules/prisma preinstall: Done
$ cat pnpm-workspace.yaml
allowBuilds:
  '@prisma/engines': true
  prisma: true
$ pnpm install   ->  Done (pnpm v12.15.0)
$ pnpm add -D vitest@5.0.5 vite@8.3.5 typescript@6.0.3 eslint@10.13.0 typescript-eslint@8.72.1 @types/node@24 @types/react@19
+ @types/node 24.19.2  + @types/react 19.3.0  + eslint 10.13.0  + typescript 6.0.3  + typescript-eslint 8.72.1  + vite 8.3.5  + vitest 5.0.5
$ pnpm exec vitest run          (1 trivial test)
 RUN  v5.0.5 ...   Test Files  1 passed (1)   Tests  1 passed (1)
$ pnpm exec eslint lint.ts      (typescript-eslint recommended)   -> exit 0
$ pnpm exec tsc --version       -> Version 6.0.3
$ pnpm exec next build          (App Router, layout avec globals.css = @import "tailwindcss", postcss.config.mjs avec @tailwindcss/postcss)
  Finished TypeScript in 949ms ...   Generating static pages (3/3)   Route / et /_not-found prerendered
  grep text-2xl .next/static/chunks/*.css -> trouvé
$ pnpm add zod@4.6.7 @asteasolutions/zod-to-openapi@9.1.0 pino@10.4.0 uuid@14.0.3 next-intl@4.14.9 radix-ui@1.8.1
  Error: ERR_PNPM_IGNORED_BUILDS ... Ignored build scripts: @parcel/watcher@2.6.0, @swc/core@1.16.20
$ node smoke.mjs   (zod 4 + zod-to-openapi OpenApiGeneratorV31, pino, uuid v7, imports next-intl et radix-ui)
openapi 3.1.0 [ '/health' ] function 36 function object
```

Conclusion : le blocage des scripts de build et le correctif `allowBuilds` se comportent sur pnpm 12.15.0 comme sur 11.22.0. Limite : `next-intl` et `radix-ui` ont été seulement importés, pas rendus dans une page Next ; `eslint-config-next` n'a pas été testé.

## 7. Validation

À valider par l'utilisateur avant la Task 2. Aucune installation n'a été faite à la racine du dépôt.
