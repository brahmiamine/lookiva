# Lookiva — Spec de design : CP-01 (projet neuf) et Phase 02 (socle + design system)

Date : 2026-10-28 · Statut : **BROUILLON À RELIRE** (aucun code écrit) · Sources : `plans/00` à `plans/13`, `plans/AGENTS.md`

## 1. Intention

Livrer Lookiva, une PWA de dressing privé (fr/en/ar, RTL), comme **produit public multi-utilisateurs** (cible plans : ~1 000 utilisateurs actifs). Cette spec couvre le cadrage CP-01 d'un projet neuf et la Phase 02 (socle technique, monolithe modulaire, design system). Les phases 03 à 13 suivent `plans/00-master-plan.md`, une phase et un checkpoint à la fois.

Succès pour CP-02 : architecture documentée et démarrable en local, CI (commande unique) verte, direction de design approuvée, aucun secret committé, DB et Redis non exposés.

## 2. CP-01 — constat projet neuf (Phase 01)

Constat factuel au 2026-10-28, sans modification :
- Le dossier `Lookiva` ne contient que `plans/` (17 fichiers). Pas de code, pas de `package.json`, pas de README, pas de dépôt git.
- `docs/` référencé par les plans est absent : registre des décisions, règles métier, modèle de données, contrats API, critères d'acceptation, ADR (`01`, `02`, `06`, `07`, `09`, `13`, `17`).
- Conséquence : les 12 ADR sont des **questions ouvertes**. Les « décisions non négociables » de chaque plan servent de base provisoire. Elles ne remplacent pas le registre manquant.

À décider avant la Phase 02 (voir §10) : création du dépôt git, hébergement du code, recréation ou non de `docs/` à partir des plans.

## 3. Décisions actées (conversation du 2026-10-28)

| Sujet | Décision |
|---|---|
| Contexte | Produit public multi-utilisateurs |
| Topologie | Un seul package, deux points d'entrée : app Next.js et worker BullMQ |
| Frontières | `ui → api → application → domain` ; `infrastructure` implémente les ports ; modules via `index.ts` public uniquement ; contrôlées en CI (`dependency-cruiser` ou règle ESLint) |
| Direction design | **B · Studio** (fond gris-bleu clair, sans-serif, cartes arrondies, accent bleu-vert, pastilles d'état) |

## 4. Architecture

```
src/
  app/[locale]/…        UI App Router (fr/en/ar, dir=rtl pour ar)
  app/api/v1/…          Route handlers minces → application/
  modules/<domaine>/
    domain/ application/ infrastructure/ api/
  platform/             ports + adapters : db, storage, weather, email,
                        embeddings, ai, clock, queue, audit
  worker/               entrypoint BullMQ (même code, autre process)
```

Modules visés, créés phase par phase : identity, catalog, wardrobe, outfits, weather, recommendations, search, events, travel, notifications, analytics, transfer, sync. **Phase 02 ne crée aucun module métier.**

Phase 02 livre : squelette, ports `platform/` avec adapters fake/locaux, API `/api/v1`, OpenAPI généré depuis Zod, i18n + RTL, design system, Compose local (MariaDB, Redis, worker), CI, `/health`, logs structurés.

## 5. Données et API

- Prisma + MariaDB 11.8. POC T02 avant verrouillage (connexion, migration, transaction, requête SQL ciblée). SQL brut (dont futur VECTOR) isolé dans `infrastructure`, toujours paramétré. Aucune table vectorielle en Phase 02.
- Identifiants opaques non devinables (proposition : UUIDv7). Aucun auto-incrément exposé.
- Temps en UTC ; fuseau IANA là où l'heure locale compte.
- Concurrence : colonne `version`, ETag, `If-Match`/`expectedVersion`, 409 en conflit.
- Idempotence : `Idempotency-Key` sur POST critiques, table `IdempotencyRecord` unique `(userId, key)` avec hash de requête.
- Erreurs : format uniforme inspiré RFC 9457 (`type`, `title`, `status`, `code`, `detail`, `requestId`, `errors[]`). Pagination par curseur.
- Isolation : chaque repository exige `ownerId` en paramètre obligatoire, fourni par le wrapper d'auth (oubli = erreur de compilation).
- Effets de bord : aucun push ni suppression d'objet pendant une transaction SQL (convention documentée ; table outbox créée au premier besoin réel, phases 04/09).
- Schémas Zod = source unique de validation et d'OpenAPI.
- Versions : rien de figé de mémoire. Next.js, Auth.js, Prisma, MariaDB, Node, BullMQ vérifiés contre la documentation officielle au T02, puis épinglés avec matrice de compatibilité datée.
- Infra locale : Compose (MariaDB, Redis, worker), réseau interne, seul l'app publie un port, healthchecks, secrets de dev via fichiers d'exemple.

## 6. Design system

- Tokens sémantiques en variables CSS (`surface`, `text`, `text-muted`, `primary`, `border`, couleurs par statut). Valeurs de départ du mockup : primaire `#0E5C63`, fond `#F4F6F8`, texte `#14202B`. Thème sombre préparé par les tokens mais **non livré en V1** sauf demande.
- Contrastes WCAG 2.2 AA vérifiés par contrôle automatique en CI ; aucun ratio garanti avant mesure.
- Primitives accessibles d'une bibliothèque existante (candidats Radix UI ou React Aria, choix au T02) ; pas de dialogues/menus réécrits à la main.
- Composants T08 : formulaires, boutons, dialogues, galerie, cartes vêtement et tenue, calendrier, badges de statut, états vide/chargement/erreur. Les 6 statuts : texte + icône + couleur.
- Pas de Storybook : page interne `/[locale]/dev/ui`, dev uniquement, tous composants en fr/en/ar et RTL.
- Cibles tactiles ≥ 44 px.

## 7. i18n et RTL

- Propriétés CSS logiques uniquement (pas de gauche/droite) ; `dir` posé sur `<html>` selon la langue ; icônes directionnelles inversées en RTL ; e-mails, noms, notes et nombres isolés pour le texte bidirectionnel.
- Un fichier de messages par langue, repli sur le français. Le texte saisi par l'utilisateur n'est jamais traduit.
- Dates et nombres via `Intl`. Le choix des chiffres arabes (arabes ou latins) est une préférence utilisateur reportée en phase 03.
- Pile de polices système avec repli arabe explicite, à valider sur appareils réels.

## 8. Tests, CI, observabilité, erreurs, secrets

- Vitest (domaine) ; intégration contre vraie MariaDB et Redis via Compose, sans mock de la base ; Playwright avec projets `fr`, `en`, `ar` (RTL) et mobile ; `axe-core` en complément de l'audit manuel WCAG de la phase 12.
- Commande unique `verify` : lint, typecheck strict, frontières de modules, tests unitaires et d'intégration, génération OpenAPI + contrôle de dérive, build, smoke Playwright, scan de secrets. Workflow de CI écrit seulement après choix de l'hébergement du code. Aucun déploiement automatique.
- Logs JSON avec `requestId`, redaction testée (mots de passe, tokens, cookies, `Authorization`, contenus d'e-mails). `/health` = liveness minimale sans dépendances ; `/ready` = base + Redis, protégé. Métriques détaillées en phase 12.
- Erreurs domaine typées → mapper unique vers l'erreur uniforme ; 500 avec `requestId` sans trace de pile. Error boundary par route ; états chargement/vide/erreur dès le départ sur chaque liste.
- `.env.example` sans valeur réelle ; variables validées par Zod au démarrage (échec rapide) ; rien de secret committé.

## 9. Hors périmètre Phase 02

Authentification, upload de photos, fournisseurs réels (météo, e-mail, IA, embeddings, stockage objet), modules métier, déploiement, tout service payant.

## 10. Blocages et décisions à valider

1. Création du dépôt git local (`git init`) et choix de l'hébergement du code (conditionne le workflow de CI).
2. Recréer ou non `docs/` (registre des décisions, règles métier, ADR) à partir des plans ; sinon les plans restent la seule source.
3. ADR-01 (actifs vs simultanés) et ADR-09 (dimensionnement) : hypothèses de charge à confirmer ; ADR-10 : fournisseurs, aucune dépense avant accord.
4. À trancher au T02 après POC : gestionnaire de paquets, bibliothèque i18n, bibliothèque de primitives UI, versions épinglées.
5. Palette et branding finaux : la direction B est choisie ; les maquettes des parcours prioritaires restent à approuver (CP-02).

## 11. Critères d'acceptation CP-02

- Architecture modulaire documentée et démarrable localement (preuve : commandes et sorties).
- Design system et maquettes principales approuvés.
- `verify` vert en environnement isolé ; DB et Redis non exposés ; aucun secret committé.
- Rapport `critère → commande/test → résultat → preuve` ; tout test non exécuté marqué `NOT RUN`.
