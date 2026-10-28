# 12 — Durcissement, performance, sauvegardes et déploiement OVH

**Statut : PLAN À EXÉCUTER UNIQUEMENT APRÈS AUTORISATION.**  
**Prérequis :** tous modules concernés fonctionnels et checkpoints précédents validés.  
**Validation de sortie :** CP-12.  
**Référence :** `../AGENTS.md`, `../docs/01-decisions-register.md`, `../docs/02-business-rules.md`, `../docs/09-acceptance-criteria.md`.

## Objectif et périmètre
Vérifier et durcir transversalement la V1 sur environnement de test isolé : sécurité, performance, disponibilité, restauration, coûts, DX et déploiement production **seulement sur autorisation explicite**.

## Décisions non négociables
VPS OVH + Compose + reverse proxy HTTPS, CI tests/build et publication après validation, backups chiffrés quotidiens offsite testés, logs30j audit90j, WCAG 2.2 AA, cible charge 1 000 utilisateurs actifs sans seuil simultané supposé.

## Préparation — à produire AVANT toute modification
- [ ] Auditer le dépôt et comparer conventions, base, versions, migrations, endpoints et tests existants avec le périmètre de cette phase.
- [ ] Lire les ADR concernés dans `../docs/13-adr-open.md` ; les signaler comme **NON APPROUVÉS** et obtenir validation des choix bloquants.
- [ ] Présenter les changements envisagés, les interfaces touchées, les risques, les migrations et les commandes de vérification. Demander feu vert pour action destructive ou dépenses.

## Plan d'exécution détaillé
- [ ] **T01.** Réviser systématiquement les contrôles d’accès de tous CRUD, fichiers, index, archives, jobs, notifications, cache et endpoints ; exécuter matrice IDOR 2 comptes.
- [ ] **T02.** Durcir Auth.js/Credentials/session revocation, tokens, CSRF et anti-bruteforce, rate-limit, protection upload, validation, raw SQL paramétré, imports hostiles.
- [ ] **T03.** Verrouiller configuration secrète, privilèges Docker non root si possible, réseau Compose interne, conteneurs santé, politique restart, HTTPS/HSTS/cert rotation.
- [ ] **T04.** Mettre en place monitoring p50/p95/p99, trafic, DB pool, Redis, queue lag, erreurs, S3 throughput, IA coûts/quota, backup age et alertes.
- [ ] **T05.** Implémenter purge des notifications 90j, logs 30j, audits 90j, corbeille 30j, export temporaire, et vérifier effacement du compte sur DB/objets/cache.
- [ ] **T06.** Concevoir sauvegardes cohérentes MariaDB + objets, chiffrement, offsite, versionnement, rotation/retention approuvée et secret recovery.
- [ ] **T07.** Exécuter restauration sur environnement isolé, chronométrer RPO/RTO ; documenter problèmes et adapter stratégie si objectifs non atteints.
- [ ] **T08.** Définir profil charge représentatif (actifs quotidiens vs simultanés, dressing moyen/photos, recherche IA, pointe), tests charge et dimensionnement après mesure.
- [ ] **T09.** Vérifier API p95 <500ms, recherche texte <1s, sémantique <3s, selon protocole, expliquer observations et coûts d’un upgrade éventuel.
- [ ] **T10.** Passer audit accessibilité WCAG 2.2 AA, clavier/lecteurs écran, et interface RTL FR/EN/AR sur matrice navigateur validée.
- [ ] **T11.** Tester dégradation météo/IA/Redis/push/storage/email, recovery jobs/outbox, circuit breaker et erreurs UX honnêtes.
- [ ] **T12.** Définir release plan : build image pinée, migrations DB répété staging, backup pré-release, smoke tests, feature flags, rollback application+DB cohérent.
- [ ] **T13.** Exécuter CI sur environnement éphémère isolé ; produire runbook exploit et coûts estimés par service ; présenter dossier GO/NO-GO.
- [ ] **T14.** Ne déclencher production ni push/main sans approbation explicite de l’utilisateur.

## Contrats API / intégrations
Rationaliser OpenAPI et schémas, endpoints health/readiness protégés selon besoin, métriques sans PII, endpoint de statut maintenance si requis. Pas de nouvelles fonctionnalités métier hors correctifs acceptés.

## Schéma de données et migration
Migrations versionnées avec répétition de déploiement, vérification intégrité relations, snapshots historiques, backups DB/S3 synchronisés. Écrire runbooks `backup`, `restore`, `rollback`, `rotate-secrets`, `incident` sans secrets.

## Vérifications obligatoires
- [ ] Matrice sécurité par compte et tests upload/import/traces clean.
- [ ] Audit WCAG 2.2 AA sur parcours critiques, contrôle manuel en plus de scans.
- [ ] Mesures p95 sur jeu/charge définis, machine dimensionnée et coûts notés.
- [ ] RPO <=24h et RTO <24h sur exercice documenté (sinon FAIL + plan).
- [ ] Tests reprise worker/jobs et fournisseurs down.
- [ ] CI tests/build/migration/Playwright et artifact image pinée.
- [ ] Démonstration pas d’exposition DB/Redis ni URLs photos publiques.

## Critères d'acceptation du checkpoint CP-12
- [ ] Rapport sécurité et tests sans défaillance critique ouverte.
- [ ] Exercice backup/restore démontré, performances mesurées honnêtement.
- [ ] Runbooks, coûts et checklist pré-déploiement approuvés ; aucune prod sans feu vert.

## Blocages / décisions à faire valider
- ADR-01 utilisateurs actifs vs simultanés, ADR-09 sizing, ADR-10 fournisseurs.
- Politique rétention sauvegardes et clés, budget mensuel maximal.
- Approbation prod, DNS/domaine, certificats, secrets et stratégie de rollback.

## Livrables attendus de l'agent
- Code et migrations uniquement si approuvés ; références des commits/PRs, sans push automatique ni déploiement production.
- Documentation mise à jour : schémas API OpenAPI, ERD, écrans, traductions, paramètres et opérations concernées.
- Rapport vérifiable `Critère -> commande/test -> résultat -> preuve`; tout test non exécuté = `NOT RUN`, jamais `PASS`.
- Liste des risques restants et demande explicite de validation **CP-12** avant phase suivante.

## Règles transversales
Toutes les données privées vérifiées côté serveur ; TypeScript strict ; transactions/idempotence sur actions critiques ; tests FR/EN/AR et RTL, mobile, erreurs et a11y pertinents ; aucun secret/PII dans les logs ; workflows sans suppression ni automatisation implicite.
