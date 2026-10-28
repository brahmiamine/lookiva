# 01 — Audit initial du dépôt et cadrage de la reprise

**Statut : PLAN À EXÉCUTER UNIQUEMENT APRÈS AUTORISATION.**  
**Prérequis :** dépôt réel et permission d’audit fournis par utilisateur.  
**Validation de sortie :** CP-01.  
**Référence :** `../AGENTS.md`, `../docs/01-decisions-register.md`, `../docs/02-business-rules.md`, `../docs/09-acceptance-criteria.md`.

## Objectif et périmètre
Comprendre l’existant sans le modifier, relever les écarts avec le produit validé et proposer un ordre de travail réaliste. Le dépôt peut être vide, existant ou partiellement construit : ne pas supposer.

## Décisions non négociables
Aucune modification du dépôt ni installation de dépendances sans accord ; aucun accès à secrets ou photos réelles non nécessaires. L’audit doit identifier l’architecture réelle avant de proposer un refactor.

## Préparation — à produire AVANT toute modification
- [ ] Auditer le dépôt et comparer conventions, base, versions, migrations, endpoints et tests existants avec le périmètre de cette phase.
- [ ] Lire les ADR concernés dans `../docs/13-adr-open.md` ; les signaler comme **NON APPROUVÉS** et obtenir validation des choix bloquants.
- [ ] Présenter les changements envisagés, les interfaces touchées, les risques, les migrations et les commandes de vérification. Demander feu vert pour action destructive ou dépenses.

## Plan d'exécution détaillé
- [ ] **T01.** Collecter URL et branche du dépôt, droits, README, package manager, scripts, Node runtime, stratégie Git, conventions de nommage, licence et branches actives.
- [ ] **T02.** Inventorier frontend/backend existants, dossiers, API, composants, styles, i18n, PWA, workers, DB/Prisma, tests, CI et déploiement.
- [ ] **T03.** Inspecter modèles et migrations actuels ; rechercher données sensibles committées, migrations destructrices possibles et versions obsolètes.
- [ ] **T04.** Identifier toutes fonctionnalités présentes et leur conformité par SF-01..SF-08 et ST-PWA (Implemented/Partial/Missing/Unverified).
- [ ] **T05.** Vérifier versions publiées et compatibilité officielle Next.js/Auth.js Credentials/Prisma MariaDB 11.8/VECTOR/BullMQ/Node ; construire matrice avec URLs et dates.
- [ ] **T06.** Analyser sécurité : auth, cookies, vérification propriétaire, URLs images, redaction logs, validation API, import, jobs, sync.
- [ ] **T07.** Exécuter uniquement les contrôles non destructifs disponibles (lint/typecheck/tests/build si explicitement autorisés), noter échecs sans les camoufler.
- [ ] **T08.** Mesurer volumétrie et besoins d’hébergement **sans** parcourir arbitrairement des données privées ou un VPS non autorisé.
- [ ] **T09.** Décrire lacunes et risques par priorité, options de migration, besoins réels de refactor ou stratégie de création de nouveau projet.
- [ ] **T10.** Présenter ADR ouverts, fournisseurs et coûts possibles avec recommandation conditionnelle, obtenir décision de départ et ordre des phases.

## Contrats API / intégrations
Aucune API à créer. Recenser endpoints présents et comparer avec `docs/07-api-contracts.md`. Produire une carte des interfaces existantes / futures.

## Schéma de données et migration
Aucune migration autorisée. Exporter seulement un ERD documentaire existant si accessible ; signaler incompatibilités / données à préserver.

## Vérifications obligatoires
- [ ] Reproduire état actuel lint/tests/build autorisés et rapporter codes sortie.
- [ ] Inventaire complet des fichiers structurants et des points d’entrée.
- [ ] Audit sécurité interutilisateur purement statique, sans exploitation active non autorisée.
- [ ] Rapport « fonctionnalités existantes vs planifiées » avec références lignes/fichiers.

## Critères d'acceptation du checkpoint CP-01
- [ ] Rapport d’audit factuel disponible, sans modification.
- [ ] Plan de transition vers phases 02..13 contextualisé au vrai repo.
- [ ] Décisions bloquantes et risques validés ou explicitement marqués ouverts.

## Blocages / décisions à faire valider
- Dépôt et branche non encore fournis.
- Droits d’audit et exécution commandes doivent être autorisés.
- Aucun contrat définitif ni fournisseur imposé avant validation ADR pertinents.

## Livrables attendus de l'agent
- Code et migrations uniquement si approuvés ; références des commits/PRs, sans push automatique ni déploiement production.
- Documentation mise à jour : schémas API OpenAPI, ERD, écrans, traductions, paramètres et opérations concernées.
- Rapport vérifiable `Critère -> commande/test -> résultat -> preuve`; tout test non exécuté = `NOT RUN`, jamais `PASS`.
- Liste des risques restants et demande explicite de validation **CP-01** avant phase suivante.

## Règles transversales
Toutes les données privées vérifiées côté serveur ; TypeScript strict ; transactions/idempotence sur actions critiques ; tests FR/EN/AR et RTL, mobile, erreurs et a11y pertinents ; aucun secret/PII dans les logs ; workflows sans suppression ni automatisation implicite.
