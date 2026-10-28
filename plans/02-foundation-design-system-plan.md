# 02 — Socle technique, monolithe modulaire et design system

**Statut : PLAN À EXÉCUTER UNIQUEMENT APRÈS AUTORISATION.**  
**Prérequis :** CP-01 approuvé.  
**Validation de sortie :** CP-02.  
**Référence :** `../AGENTS.md`, `../docs/01-decisions-register.md`, `../docs/02-business-rules.md`, `../docs/09-acceptance-criteria.md`.

## Objectif et périmètre
Préparer l’architecture Next.js avec API versionnée, Prisma/MariaDB, Redis/worker, i18n et design system validé avant les écrans. Installer les environnements de développement et CI isolés sans ouvrir de production.

## Décisions non négociables
Monolithe modulaire Next.js App Router, TypeScript strict, API REST + OpenAPI, MariaDB 11.8 LTS compatible, worker BullMQ/Redis, Compose sur OVH à terme ; maquettes avant tous les écrans ; production sur approbation.

## Préparation — à produire AVANT toute modification
- [ ] Auditer le dépôt et comparer conventions, base, versions, migrations, endpoints et tests existants avec le périmètre de cette phase.
- [ ] Lire les ADR concernés dans `../docs/13-adr-open.md` ; les signaler comme **NON APPROUVÉS** et obtenir validation des choix bloquants.
- [ ] Présenter les changements envisagés, les interfaces touchées, les risques, les migrations et les commandes de vérification. Demander feu vert pour action destructive ou dépenses.

## Plan d'exécution détaillé
- [ ] **T01.** Définir et faire valider la topologie modules, architecture UI/API/application/domaine/infrastructure et conventions import boundaries.
- [ ] **T02.** Verrouiller versions après vérification compatibilité et POC Prisma+MariaDB (connexion, migration, transactions, requête SQL ciblée).
- [ ] **T03.** Définir schémas validation comme source OpenAPI, erreurs API uniformes, pagination, IDs, version/ETag, idempotency middleware et timestamps.
- [ ] **T04.** Préparer environnement Docker local CI (DB/Redis/worker) avec healthchecks, secrets dev, ports internes et tests de démarrage.
- [ ] **T05.** Créer squelette modules et abstractions providers : DB, stockage, météo, email, embeddings, IA, clock, queue, audit.
- [ ] **T06.** Mettre en place structure App Router localisée, direction RTL par locale et système de traductions avec fallback FR.
- [ ] **T07.** Proposer deux directions de design, définir tokens, composants de base et maquettes des parcours prioritaires ; attendre accord sur direction.
- [ ] **T08.** Construire composants accessibles : formulaires, boutons, dialogues, galerie, cartes vêtements/tenues, calendrier, badges, états vides/erreurs.
- [ ] **T09.** Préparer pipeline CI lint/typecheck/tests/unit/int/OpenAPI/build, sans déploiement production automatique.
- [ ] **T10.** Ajouter observabilité structurée minimale, health/readiness, redaction données sensibles, plan de secrets et environnement de test.
- [ ] **T11.** Réaliser smoke tests téléphone/desktop FR/EN/AR avec contrôle de direction et clavier.
- [ ] **T12.** Documenter configuration, lancement local, plan de migration et liste des coûts/fournisseurs encore ouverts.

## Contrats API / intégrations
Conventions `/api/v1`, erreurs, auth wrapper, `GET /health` protégé/limité selon contexte, génération OpenAPI à partir schémas et docs interactives en environnement protégé.

## Schéma de données et migration
Base initiale MariaDB, migration de référentiels minimaux ; ne pas créer de table vectorielle définitive avant choix embeddings. Prisma schema et SQL migrations reproductibles.

## Vérifications obligatoires
- [ ] Tests DB et Redis sous Compose isolé.
- [ ] TypeScript strict, lint, build, OpenAPI schema consistency.
- [ ] Composants form accessibles clavier/zoom, RTL ar, FR fallback.
- [ ] Aucun secret committé, DB/Redis privés et non exposés.

## Critères d'acceptation du checkpoint CP-02
- [ ] Architecture modulaire documentée et faisable localement.
- [ ] Design system/maquettes principales acceptés.
- [ ] CI et environnements locaux/tests démarrent avec preuves.

## Blocages / décisions à faire valider
- Version compatible d’Auth.js/Prisma/Next.js et MariaDB testée.
- ADR-01, ADR-09 et fournisseur/dimensionnement infra ouverts.
- Palette/branding UI et maquettes à approuver.

## Livrables attendus de l'agent
- Code et migrations uniquement si approuvés ; références des commits/PRs, sans push automatique ni déploiement production.
- Documentation mise à jour : schémas API OpenAPI, ERD, écrans, traductions, paramètres et opérations concernées.
- Rapport vérifiable `Critère -> commande/test -> résultat -> preuve`; tout test non exécuté = `NOT RUN`, jamais `PASS`.
- Liste des risques restants et demande explicite de validation **CP-02** avant phase suivante.

## Règles transversales
Toutes les données privées vérifiées côté serveur ; TypeScript strict ; transactions/idempotence sur actions critiques ; tests FR/EN/AR et RTL, mobile, erreurs et a11y pertinents ; aucun secret/PII dans les logs ; workflows sans suppression ni automatisation implicite.
