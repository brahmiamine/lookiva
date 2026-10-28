# TOUS LES PLANS — Fichier unique de transfert

Ce fichier regroupe les **plans uniquement**. Lisez également `AGENTS.md` et `docs/` pour les décisions, modèles de données et spécifications de référence.

<!-- source: plans/00-master-plan.md -->

# 00 — MASTER PLAN : Dressing intelligent V1 complète

**Ce document orchestre les autres plans et ne donne pas, à lui seul, autorisation de coder.** Chaque phase a un checkpoint à faire approuver avant de modifier le système ou de passer à la suivante. Le dépôt sera fourni plus tard.

## Objectif du projet
Livrer l'application PWA de dressing privé, multi-langues (fr/en/ar RTL), avec inventaire unique par pièce physique, photos, états, tenues multiples/jour, météo et propositions, recherche multilingue, historiques/statistiques, événements/récurrences, valises, notifications et offline limité. Respecter toutes décisions du registre.

## Documents fondamentaux
- `../AGENTS.md` : contrat des agents, interdiction de supposer l'accord de l'utilisateur.
- `../docs/01-decisions-register.md` : décisions issues des 7 questionnaires.
- `../docs/02-business-rules.md` : invariants.
- `../docs/13-adr-open.md` : ADR **proposés non approuvés**, gates.
- `../docs/06-data-model.md` : data model conceptuel.
- `../docs/07-api-contracts.md` : contrats API à matérialiser.
- `../docs/09-acceptance-criteria.md` : recette et preuves.

## Phases ordonnées
| Phase | Plan | Dépendances | Checkpoint |
|---|---|---|---|
| 01 | `01-repository-audit-plan.md` | vrai dépôt fourni, autorisation | CP-01 Audit approuvé |
| 02 | `02-foundation-design-system-plan.md` | CP-01 | CP-02 architecture/design & compatibilité |
| 03 | `03-auth-profiles-i18n-plan.md` | CP-02 | CP-03 contrôle comptes/sessions/RTL |
| 04 | `04-wardrobe-photos-plan.md` | CP-03 | CP-04 inventaire/photos/corbeille |
| 05 | `05-outfits-history-plan.md` | CP-04 | CP-05 port confirmé/lavage distinct |
| 06 | `06-weather-recommendations-plan.md` | CP-05 | CP-06 moteur règles + météo et IA opt-in |
| 07 | `07-search-semantic-plan.md` | CP-04, CP-06 | CP-07 corpus trilingue + index |
| 08 | `08-events-travel-plan.md` | CP-05, CP-06 | CP-08 récurrences et valises |
| 09 | `09-notifications-plan.md` | CP-03, CP-06, CP-08 | CP-09 rappels + push + permissions |
| 10 | `10-analytics-import-export-plan.md` | CP-04, CP-05, CP-08 | CP-10 coût/port et import/export |
| 11 | `11-offline-pwa-sync-plan.md` | CP-04, CP-05 | CP-11 offline privé et idempotent |
| 12 | `12-security-performance-deployment-plan.md` | modules précédents | CP-12 charge, sécurité, backups, prod préparée |
| 13 | `13-final-acceptance-plan.md` | 01..12 | CP-13 validation complète / go-no-go |

## Dépendances transversales
- Auth + permissions avant données privées.
- Référentiels + dressing avant outfits/recherche/valises.
- `WearRecord` source des statistiques et feedback historique ; no auto wash.
- Stockage privé et upload sécurisé avant photo réelle.
- Moteur déterministe avant IA ; recherche SQL texte avant vecteur.
- Planification/événements avant création de rappels.
- API versionnée et schémas validation/OpenAPI dès les premiers endpoints.
- i18n, RTL, a11y, tests, sécurité et observabilité **à chaque phase** ; la phase 12 est revue finale et non report de la sécurité.

## Politique de version
Avant setup, vérifier versions stables compatibles des outils. Ne pas imposer « latest » sans test. Pin exact dans lockfile + documentation ; migrations reproductibles, feature flags IA/notifications/offline selon les pilotes.

## Gate d'acceptation générique par phase
- Tâches approuvées réalisées sans élargir périmètre.
- Tests unit/int/E2E selon pertinence passés **sur environnement réel**, preuves datées.
- Autorisations par utilisateur et journaux sans PII testés.
- OpenAPI synchronisé, migrations appliquées sur environnement temporaire et rollback évalué.
- FR/EN/AR, RTL, mobile et WCAG 2.2 AA cible contrôlés pour écrans touchés.
- Conditions d'échec/fallback/cas limites traités.
- Revue de décision, risques et coûts ; checkpoint signé par propriétaire avant suivant.

## Liste des ADR à ne pas oublier
ADR-01..ADR-12 non approuvés (`../docs/13-adr-open.md`) : capacité MAU vs simultanéité, révocation session, horizon récurrences, taux utilisation, doublons import, historique minimal purge, categories notifications off, quotas IA, dimensionnement, fournisseurs, références après suppression, qualité corpus recherche. Certains principes sont validés mais leur implémentation ne l'est pas.

## Actions interdites sans accord
Créer le repo cible, effacer fichiers existants, modifier `main`, push, déployer production, souscrire service payant, publier données privées, envoyer des photos à IA, installer un agent sur le VPS, exécuter migrations destructrices.

## Journal d'avancement exigé
Pour chaque checkpoint : phase, date, commit, tâches réalisées, décisions prises, commandes/tests/résultats, captures (sans secrets), sécurité/données, perf le cas échéant, questions non résolues et demande claire de validation.

---

<!-- source: plans/01-repository-audit-plan.md -->

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

---

<!-- source: plans/02-foundation-design-system-plan.md -->

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

---

<!-- source: plans/03-auth-profiles-i18n-plan.md -->

# 03 — Comptes, sessions, profil et internationalisation

**Statut : PLAN À EXÉCUTER UNIQUEMENT APRÈS AUTORISATION.**  
**Prérequis :** CP-02 approuvé.  
**Validation de sortie :** CP-03.  
**Référence :** `../AGENTS.md`, `../docs/01-decisions-register.md`, `../docs/02-business-rules.md`, `../docs/09-acceptance-criteria.md`.

## Objectif et périmètre
Livrer authentification email/password vérifiée, récupération, sessions individuellement révocables, profil/onboarding minimal et infrastructure des trois langues RTL. Protéger les premières API privées avant toute donnée réelle.

## Décisions non négociables
Email/mot de passe seulement ; email vérifié pour activation ; onboarding langue + ville seulement ; GPS facultatif ; pas de genre ; toutes données privées ; langue fr/en/ar et format chiffres/dates ; sessions listées et révocables ; photos jamais vers IA.

## Préparation — à produire AVANT toute modification
- [ ] Auditer le dépôt et comparer conventions, base, versions, migrations, endpoints et tests existants avec le périmètre de cette phase.
- [ ] Lire les ADR concernés dans `../docs/13-adr-open.md` ; les signaler comme **NON APPROUVÉS** et obtenir validation des choix bloquants.
- [ ] Présenter les changements envisagés, les interfaces touchées, les risques, les migrations et les commandes de vérification. Demander feu vert pour action destructive ou dépenses.

## Plan d'exécution détaillé
- [ ] **T01.** Implémenter modèles User, Credential, EmailToken, SessionRegistry et UserPreferences avec migrations et contraintes anti-duplication.
- [ ] **T02.** Implémenter inscription email/mot de passe avec mot de passe haché selon norme retenue, limitation rate, réponse anti-énumération, vérification email one-time et cooldown renvoi.
- [ ] **T03.** Configurer Auth.js Credentials selon version compatible ; intégrer contrôle de session côté serveur et registre révocable par utilisateur et appareil.
- [ ] **T04.** Implémenter login, logout session, logout toutes sessions, sessions list/revoke, gestion session expirée et connexion après vérification.
- [ ] **T05.** Créer reset mot de passe token haché/TTL/usage unique ; invalider sessions pertinentes, rate limit et audit sans révéler email.
- [ ] **T06.** Intégrer fournisseur transactionnel derrière adapter ; dev fake/local outbox, production provider uniquement après approbation coût/données.
- [ ] **T07.** Créer onboarding langue/ville, géocodage/saisie manuelle avec refus GPS sans blocage, timezone locale configurable.
- [ ] **T08.** Intégrer préférences IA et apprentissage indépendantes, sensibilité thermique, formats dates/chiffres et langue ; aucune autre préférence requise au départ.
- [ ] **T09.** Implémenter routing fr/en/ar, RTL pour ar, fallback traduction FR et composants bidi-safe ; ne jamais traduire texte utilisateur.
- [ ] **T10.** Définir désactivation des comptes, requête d’effacement et export en état préparatoire sans promettre purge des backup déjà en place.
- [ ] **T11.** Sécuriser owner scopes et conventions guard de toutes APIs à venir ; tests interuser, JWT révoqué, cookies/CSRF selon stack.
- [ ] **T12.** Concevoir UI mobile et accessible inscription/vérification/reset/sessions/paramètres avec chargement, erreurs, confirmations et RTL.

## Contrats API / intégrations
`/auth/register`, `/auth/email/verify`, `/auth/password/forgot`, `/auth/password/reset`, `/me`, `/me/sessions`, `/me/sessions/{id}`, `/me/preferences`, interfaces `EmailTransport`, `SessionRegistry`. Auth.js routes techniques séparées.

## Schéma de données et migration
User, Credential, EmailToken, SessionRegistry, UserPreferences, ConsentRecord. Transactions signup/token et révocation vérifiées ; ne pas exposer hashes.

## Vérifications obligatoires
- [ ] E2E inscription/vérification/connexion/récupération et token expiré/rejoué.
- [ ] Test que session révoquée est rejetée côté API même si cookie/JWT reste présent.
- [ ] Test 2 comptes et IDOR sur préférences.
- [ ] FR/EN/AR complet, RTL formulaires, adresses email bidi, keyboard/screen reader.
- [ ] Rate limiting, anti-énumération, secrets absents des logs.

## Critères d'acceptation du checkpoint CP-03
- [ ] Comptes vérifiés et sessions révocables démontrés.
- [ ] Onboarding 2 champs seulement, GPS facultatif.
- [ ] Tests multilingues et tenant isolation passés.

## Blocages / décisions à faire valider
- ADR-02 registre des sessions à approuver techniquement.
- Stratégie de hachage/password/TTL token et de session à faire approuver.
- Fournisseur email transactionnel et domaine/validation DNS non sélectionnés.

## Livrables attendus de l'agent
- Code et migrations uniquement si approuvés ; références des commits/PRs, sans push automatique ni déploiement production.
- Documentation mise à jour : schémas API OpenAPI, ERD, écrans, traductions, paramètres et opérations concernées.
- Rapport vérifiable `Critère -> commande/test -> résultat -> preuve`; tout test non exécuté = `NOT RUN`, jamais `PASS`.
- Liste des risques restants et demande explicite de validation **CP-03** avant phase suivante.

## Règles transversales
Toutes les données privées vérifiées côté serveur ; TypeScript strict ; transactions/idempotence sur actions critiques ; tests FR/EN/AR et RTL, mobile, erreurs et a11y pertinents ; aucun secret/PII dans les logs ; workflows sans suppression ni automatisation implicite.

---

<!-- source: plans/04-wardrobe-photos-plan.md -->

# 04 — Dressing, photos, états, ensembles et corbeille

**Statut : PLAN À EXÉCUTER UNIQUEMENT APRÈS AUTORISATION.**  
**Prérequis :** CP-03 approuvé.  
**Validation de sortie :** CP-04.  
**Référence :** `../AGENTS.md`, `../docs/01-decisions-register.md`, `../docs/02-business-rules.md`, `../docs/09-acceptance-criteria.md`.

## Objectif et périmètre
Implémenter le modèle « une pièce physique = une fiche », classification standard et personnalisée, champs météo, média 5x10Mo, détourage opt-in, organisation, bulk, corbeille 30j, et import/export dont l’implémentation détaillée finale sera renforcée en phase 10.

## Décisions non négociables
Saisie manuelle ; catégorie/sous-catégorie/couleur obligatoires ; custom subtype rattaché à type standard ; 6 statuts un seul courant ; Disponible pour recommandations ; original+optimisé+détouré ; jamais reconnaissance IA de la photo ; suppression et duplication indépendantes.

## Préparation — à produire AVANT toute modification
- [ ] Auditer le dépôt et comparer conventions, base, versions, migrations, endpoints et tests existants avec le périmètre de cette phase.
- [ ] Lire les ADR concernés dans `../docs/13-adr-open.md` ; les signaler comme **NON APPROUVÉS** et obtenir validation des choix bloquants.
- [ ] Présenter les changements envisagés, les interfaces touchées, les risques, les migrations et les commandes de vérification. Demander feu vert pour action destructive ou dépenses.

## Plan d'exécution détaillé
- [ ] **T01.** Créer et seed les référentiels stables catégories/sous-types/couleurs/nuances/saisons/styles et leurs libellés FR/EN/AR ; pas de catégorie par genre.
- [ ] **T02.** Créer tables Garment, GarmentColor, Season, Style, CustomSubcategory, GarmentStatusEvent, GarmentPhoto, ensembles/collections/tags et relations.
- [ ] **T03.** Implémenter CRUD garments avec validation serveur et champ météo nullable/unknown (chaleur, pluie, coupe-vent, respirabilité, couches).
- [ ] **T04.** Construire écran galerie responsive filtres et fiche avec surnom, achat facultatif (prix/devise/date/magasin), notes et illustrations génériques.
- [ ] **T05.** Implémenter photographie caméra/galerie, max5 et 10Mo chacune ; pipeline MIME réel, compression, rotation/recadrage, choix photo principale, EXIF sane.
- [ ] **T06.** Abstraire stockage objet local privé dev/S3 privé prod, original et versions ; logique de droits signed URL et suppression avec référence de duplication.
- [ ] **T07.** Ajouter détourage local d’abord, cloud facultatif avec consentement spécifique et audit ; fallback sur photo originale.
- [ ] **T08.** Implémenter duplication par préremplissage modifiable et confirmation, nouvel id/statut Disponible, photo éventuellement copiée, aucun historique/favori.
- [ ] **T09.** Implémenter transitions d’états, historique daté, corrections manuelles ; actions groupées états/catégorie/suppression atomiques ou retour transactionnel détaillé.
- [ ] **T10.** Créer custom subcategory avec référentiel compatible, réaffectation avant suppression ; étiquettes, collections et ensembles indépendants des tenues.
- [ ] **T11.** Ajouter corbeille 30 jours, restauration relations valides, purger copies photo seulement non référencées, avertir tenues actives et conserver snapshots historiques.
- [ ] **T12.** Introduire contrat archive et flux d’import sécurisé en lecture/prévalidation, sans recouvrir la logique approfondie de phase 10.
- [ ] **T13.** Ajouter tests et UI de chargement/erreurs, image absente, 6e photo, statut concurrent et double duplication.

## Contrats API / intégrations
`/catalog/categories`, `/custom-subcategories`, `/garments`, `/{id}/duplicate`, `/{id}/status`, `/{id}/photos`, `/garments/bulk-actions`, `/garments/trash`, `/garments/{id}/restore`, `/tags`, `/collections`, `/garment-sets`. DTO validés -> OpenAPI.

## Schéma de données et migration
Relations et indexes du dressing dans `docs/06-data-model.md` ; `deletedAt`, `purgeAfter`, unique owner guards, transactions pour photos/état/duplication. Migrer et tester scénario pièce supprimée liée à tenue/ensemble. Fichiers stockés hors DB et référencés privément.

## Vérifications obligatoires
- [ ] Tests 2 pièces identiques : identifiants et états indépendants.
- [ ] Photos 0/5/6, 10Mo+, faux MIME, EXIF, photo principale, héritage duplication.
- [ ] Custom subcategory catégorie compatible, suppression avec réaffectation.
- [ ] 6 statuts exclusifs et histoire transitions, only AVAILABLE auto recommandable.
- [ ] Bulk ne touche pas pièces non choisies ; concurrence 409.
- [ ] Corbeille 30j, restauration, purge photo liée/non liée, tests interuser.

## Critères d'acceptation du checkpoint CP-04
- [ ] Fiche vêtement complète, photos et opérations groupées démontrées.
- [ ] Aucune photo accessible par utilisateur étranger ou URL publique durable.
- [ ] Corbeille et restauration testées, y compris photos partagées par duplication.

## Blocages / décisions à faire valider
- ADR-06 / ADR-11 méthode snapshot et références après purge.
- Fournisseur S3 prod et quota total photo non validés.
- Algorithme local de détourage et possibilité de cloud consentie à étudier.

## Livrables attendus de l'agent
- Code et migrations uniquement si approuvés ; références des commits/PRs, sans push automatique ni déploiement production.
- Documentation mise à jour : schémas API OpenAPI, ERD, écrans, traductions, paramètres et opérations concernées.
- Rapport vérifiable `Critère -> commande/test -> résultat -> preuve`; tout test non exécuté = `NOT RUN`, jamais `PASS`.
- Liste des risques restants et demande explicite de validation **CP-04** avant phase suivante.

## Règles transversales
Toutes les données privées vérifiées côté serveur ; TypeScript strict ; transactions/idempotence sur actions critiques ; tests FR/EN/AR et RTL, mobile, erreurs et a11y pertinents ; aucun secret/PII dans les logs ; workflows sans suppression ni automatisation implicite.

---

<!-- source: plans/05-outfits-history-plan.md -->

# 05 — Tenues journalières, modèles, port réel et lavage facultatif

**Statut : PLAN À EXÉCUTER UNIQUEMENT APRÈS AUTORISATION.**  
**Prérequis :** CP-04 approuvé.  
**Validation de sortie :** CP-05.  
**Référence :** `../AGENTS.md`, `../docs/01-decisions-register.md`, `../docs/02-business-rules.md`, `../docs/09-acceptance-criteria.md`.

## Objectif et périmètre
Livrer composition, planning jour/semaine, plusieurs horaires/occasions le même jour, modèles favoris, historique de port confirmé, derniers ports de pièces individuelles et parcours de lavage strictement facultatif.

## Décisions non négociables
Une tenue planifiée n’est jamais portée sans confirmation ; les pièces effectivement portées constituent snapshot historique ; le lavage n’est **jamais automatique**, cases toutes décochées ; statuts DRAFT/PLANNED/WORN/CANCELLED ; avertissements de conflit distincts des statuts.

## Préparation — à produire AVANT toute modification
- [ ] Auditer le dépôt et comparer conventions, base, versions, migrations, endpoints et tests existants avec le périmètre de cette phase.
- [ ] Lire les ADR concernés dans `../docs/13-adr-open.md` ; les signaler comme **NON APPROUVÉS** et obtenir validation des choix bloquants.
- [ ] Présenter les changements envisagés, les interfaces touchées, les risques, les migrations et les commandes de vérification. Demander feu vert pour action destructive ou dépenses.

## Plan d'exécution détaillé
- [ ] **T01.** Modéliser Outfit, OutfitItem, OutfitTemplate, OutfitTemplateItem, WearRecord et WearRecordItem avec timestamps UTC + date/heure zone locale IANA.
- [ ] **T02.** Implémenter composition manuelle via inventaire et ensembles, ajout/retrait/remplacement des pièces avec identifiants uniques et rôles vestimentaires.
- [ ] **T03.** Créer vue Jour et Semaine, ordre chronologique, occasions, horaires de fin facultatifs ; permettre plusieurs tenues le même jour.
- [ ] **T04.** Créer brouillon sauvegardable incomplet, planification avec date/heure de début/occasion et avertissement si rôles manquants.
- [ ] **T05.** Créer modèles favoris indépendants d’une date ; réutiliser vers nouvelle occurrence sans modifier l’original ou les planifications précédentes.
- [ ] **T06.** Détecter conflits d’une même pièce entre créneaux/valises/états indisponibles ; expliquer et suggérer remplacement, jamais bloquer de façon arbitraire.
- [ ] **T07.** Implémenter endpoint `confirm-worn` avec snapshot des vêtements réellement portés, idempotency key, transaction statut + WearRecord, détection de double confirmation.
- [ ] **T08.** Après résultat succès, afficher panneau facultatif des vêtements réellement portés ; cases toutes décochées et états actuels affichés.
- [ ] **T09.** Implémenter `mark-to-wash` transaction indépendante (validation owner/état/version, subset, transitions et audit), pas d’auto-rollback du port en cas d’échec.
- [ ] **T10.** Permettre ignorer/fermer la proposition sans modifier les états, et plus tard modifier manuellement depuis fiche.
- [ ] **T11.** Implémenter historique dernière tenue / trois dernières, et dernière/3 dates de chaque vêtement individuel ; corrections de port auditées.
- [ ] **T12.** Préserver snapshots lisibles après modification/suppression de vêtement, sans conserver anciennes photos définitivement.
- [ ] **T13.** Ajouter E2E du parcours avec port puis lavage partiel, annulation de port, conflit concurrent et idempotence.

## Contrats API / intégrations
`/outfits`, `/outfit-templates`, `/outfits/{id}/confirm-worn`, `/wear-records/{id}/mark-to-wash`, `/wear-records/{id}`, `/wear-records/{id}/invalidate`, APIs fiches dernières utilisations. POST critiques Idempotency-Key, expectedVersion et schémas OpenAPI.

## Schéma de données et migration
Outfit* et WearRecord* + relation éventuelle vers événements. Invariant 1 WearRecord actif / occurrence Outfit et unique (outfitId, garmentId) dans composition ; snapshot historique immutable sauf correction auditée. 2 transactions distinctes : confirm port puis changement états.

## Vérifications obligatoires
- [ ] 3 tenues même jour avec horaires/occasions, statuts indépendants.
- [ ] Confirmer port crée exactement un snapshot et ne change aucun garment.status.
- [ ] Ignorer lavage : pas de transition, record conservé.
- [ ] 2 cases cochées sur 4 : exactement 2 passages À laver, autres intacts.
- [ ] Échec lavage ne supprime pas port ; échec port n’affiche pas succès lavage.
- [ ] Réessayer endpoints avec même clé : aucun doublon.
- [ ] Historique après modification ou purge d’une fiche, sans photo résiduelle.
- [ ] FR/EN/AR RTL jour/semaine, accessibilité dialogue et cases.

## Critères d'acceptation du checkpoint CP-05
- [ ] Port et états sont indépendants et vérifiés transactionnellement.
- [ ] Modèles et tenues multi-jour fonctionnent ; historique individuel fiable.
- [ ] Toutes les règles de lavage facultatif démontrées.

## Blocages / décisions à faire valider
- ADR-11 relation entre suppressions et planifications, stratégie de snapshots.
- Règles de conflits horaires lorsque heure de fin absente : avertissements limités aux certitudes.
- Convention de fuseaux et corrections historiques à préciser en contrat.

## Livrables attendus de l'agent
- Code et migrations uniquement si approuvés ; références des commits/PRs, sans push automatique ni déploiement production.
- Documentation mise à jour : schémas API OpenAPI, ERD, écrans, traductions, paramètres et opérations concernées.
- Rapport vérifiable `Critère -> commande/test -> résultat -> preuve`; tout test non exécuté = `NOT RUN`, jamais `PASS`.
- Liste des risques restants et demande explicite de validation **CP-05** avant phase suivante.

## Règles transversales
Toutes les données privées vérifiées côté serveur ; TypeScript strict ; transactions/idempotence sur actions critiques ; tests FR/EN/AR et RTL, mobile, erreurs et a11y pertinents ; aucun secret/PII dans les logs ; workflows sans suppression ni automatisation implicite.

---

<!-- source: plans/06-weather-recommendations-plan.md -->

# 06 — Météo, moteur de règles et recommandation IA facultative

**Statut : PLAN À EXÉCUTER UNIQUEMENT APRÈS AUTORISATION.**  
**Prérequis :** CP-05 approuvé.  
**Validation de sortie :** CP-06.  
**Référence :** `../AGENTS.md`, `../docs/01-decisions-register.md`, `../docs/02-business-rules.md`, `../docs/09-acceptance-criteria.md`.

## Objectif et périmètre
Implémenter recommandations fiables et explicables utilisant uniquement les vêtements disponibles, météo sur créneaux, couches, occasion et préférences, avec 3 alternatives immédiates si possibles et mode IA facultatif sous quota.

## Décisions non négociables
Priorité météo/occasion > confort > styles/couleurs > variété ; propriétés inconnues signalées ; ville profil surchargeable ; IA n’invente rien, ne reçoit pas photos, ne peut contourner autorisations/statuts ; changement météo n’écrase pas tenue.

## Préparation — à produire AVANT toute modification
- [ ] Auditer le dépôt et comparer conventions, base, versions, migrations, endpoints et tests existants avec le périmètre de cette phase.
- [ ] Lire les ADR concernés dans `../docs/13-adr-open.md` ; les signaler comme **NON APPROUVÉS** et obtenir validation des choix bloquants.
- [ ] Présenter les changements envisagés, les interfaces touchées, les risques, les migrations et les commandes de vérification. Demander feu vert pour action destructive ou dépenses.

## Plan d'exécution détaillé
- [ ] **T01.** Définir `WeatherProvider` (ville, timezone, date, fenêtre, issuedAt, conditions et niveaux de fiabilité) et fournisseur(s) candidats selon budget/qualité.
- [ ] **T02.** Implémenter géocodage de ville choisie et préférence par tenue, sans GPS obligatoire ; cacher forecast datée et respecter quotas fournisseur.
- [ ] **T03.** Construire modèle de confort thermique (frileux/neutre/chaud optionnel) et exigences météorologiques selon pluie/vent/froid/chaleur.
- [ ] **T04.** Définir taxonomie rôles (couche de base, haut, bas, robe/combinaison, intermédiaire, extérieure, chaussure, accessoire), complétude par occasion et niveau de météo.
- [ ] **T05.** Implémenter moteur déterministe de sélection, exclusion garments non disponibles, classement compatibilité météo, occasion, styles/couleurs, variété sans interdire pièces récemment portées.
- [ ] **T06.** Signaliser propriétés manquantes comme hypothèses, distinguer « niveau pluie inconnu » de « imperméable » ; ne pas persister les déductions dans la fiche.
- [ ] **T07.** Construire jusqu’à 3 propositions distinctes, retour <3 si garde-robe insuffisante, composition partielle + manque séparé non possédé.
- [ ] **T08.** Ajouter « autre proposition » et mécanisme anti-répétition de fingerprints dans la session de recommandation.
- [ ] **T09.** Implémenter IA opt-in via adaptateur local/externe et re-ranking limité ; filtrer outputs IDs/owner/status, cap coûts/quotas, fallback rules.
- [ ] **T10.** Enregistrer feedback accepter/refuser/modifier pour personnalisation opt-in et suppression indépendante sans supprimer les tenues.
- [ ] **T11.** Implémenter comparaison météo précédente/nouvelle avec seuils d’impact fixes sur une tenue, avertissement et suggestion sans remplacement automatique.
- [ ] **T12.** Construire UI trois propositions, vue grille/lookbook, raisons et avertissements, sélection/édition manuelle, bouton de confirmation.
- [ ] **T13.** Valider tests de pertinence avec cas saison inconnue, robe, froid pluie, météo indisponible, IA crash et dressing réduit.

## Contrats API / intégrations
`/recommendations/outfits`, `/recommendations/feedback`, `WeatherProvider`, `OptionalRecommendationAI`, préférences utilisateur. API retourne source/justifications/hypothèses/issuedAt, aucune sauvegarde auto de propositions.

## Schéma de données et migration
WeatherSnapshot et RecommendationFeedback, éventuellement méta reco/version modèle. Pas d’écriture du statut vêtement par moteur. Consentements enregistrés côté profil et budgets/quotas observables.

## Vérifications obligatoires
- [ ] 3 propositions distinctes quand possible, jamais une 3e fictive.
- [ ] Tests de propriété: chaque ID appartient user et état AVAILABLE.
- [ ] Robe valide sans pantalon, couches cohérentes, chaleur/frileux selon préférences.
- [ ] Météo absente => manuel et fallback, pas de prévisions inventées.
- [ ] IA off / quota / provider timeout => règles et pas de photo sortante.
- [ ] Changement météo => pas d’écrasement, avertissement clair.
- [ ] Tests de charge sous dataset représentatif et suivi budget.

## Critères d'acceptation du checkpoint CP-06
- [ ] Moteur règles fonctionnel sans fournisseur IA.
- [ ] Propositions météo contextualisées et explicables.
- [ ] Aucun automatisme destructif, latence et budgets mesurés.

## Blocages / décisions à faire valider
- ADR-08 quotas précis par fonctionnalités à approuver.
- ADR-10 fournisseur météo et IA à faire approuver avant dépense.
- Seuils impact météo fixes à expliciter, calendrier/récurrence interactions.

## Livrables attendus de l'agent
- Code et migrations uniquement si approuvés ; références des commits/PRs, sans push automatique ni déploiement production.
- Documentation mise à jour : schémas API OpenAPI, ERD, écrans, traductions, paramètres et opérations concernées.
- Rapport vérifiable `Critère -> commande/test -> résultat -> preuve`; tout test non exécuté = `NOT RUN`, jamais `PASS`.
- Liste des risques restants et demande explicite de validation **CP-06** avant phase suivante.

## Règles transversales
Toutes les données privées vérifiées côté serveur ; TypeScript strict ; transactions/idempotence sur actions critiques ; tests FR/EN/AR et RTL, mobile, erreurs et a11y pertinents ; aucun secret/PII dans les logs ; workflows sans suppression ni automatisation implicite.

---

<!-- source: plans/07-search-semantic-plan.md -->

# 07 — Recherche hybride FR/EN/AR, vecteurs et synonymes

**Statut : PLAN À EXÉCUTER UNIQUEMENT APRÈS AUTORISATION.**  
**Prérequis :** CP-04 et CP-06 approuvés.  
**Validation de sortie :** CP-07.  
**Référence :** `../AGENTS.md`, `../docs/01-decisions-register.md`, `../docs/02-business-rules.md`, `../docs/09-acceptance-criteria.md`.

## Objectif et périmètre
Construire une recherche strictement privée mêlant SQL filtres, texte (synonymes/fautes/translittérations pertinentes) et vecteurs MariaDB, avec correspondances cross-language, tri, explication et fallback résilient.

## Décisions non négociables
FR/EN/AR standard + dictionnaire dialectal courant documenté ; texte personnel original inchangé ; contraintes structurées dures > score IA ; seules données du propriétaire ; rechercher par description, type, couleur, matière, marque, notes, styles, saison, états, tags, collections et ensembles.

## Préparation — à produire AVANT toute modification
- [ ] Auditer le dépôt et comparer conventions, base, versions, migrations, endpoints et tests existants avec le périmètre de cette phase.
- [ ] Lire les ADR concernés dans `../docs/13-adr-open.md` ; les signaler comme **NON APPROUVÉS** et obtenir validation des choix bloquants.
- [ ] Présenter les changements envisagés, les interfaces touchées, les risques, les migrations et les commandes de vérification. Demander feu vert pour action destructive ou dépenses.

## Plan d'exécution détaillé
- [ ] **T01.** Préparer corpus d’évaluation FR/EN/AR depuis `docs/17-search-evaluation-corpus.md`, ajouter cas dialectes validés, exigences precision/recall et filtrage sans fuite tenant.
- [ ] **T02.** Réaliser POC MariaDB 11.8 VECTOR + FULLTEXT + Prisma migration SQL paramétrée sur DB éphémère, documenter restrictions de dimension/index.
- [ ] **T03.** Définir normalisation texte accents/casse/variantes arabes et termes synonymes, y compris « basket »/« sneakers », en conservant texte original.
- [ ] **T04.** Implémenter parser d’intentions pour requêtes « pantalons noirs disponibles pour le travail », traduire valeurs standard en IDs stables.
- [ ] **T05.** Ajouter index textuel/catalogue, gérer notes personnelles et étiquettes sans fuite ; paginer, trier pertinence/date/disponibilité/fréquence.
- [ ] **T06.** Concevoir `EmbeddingProvider` local/externe avec version/dimension/model ID, budget, timeouts, tests trilingues et protection des données.
- [ ] **T07.** Créer `SearchDocument` et index vectoriel compatible, isoler SQL spécifique, filtrer owner/soft-deleted avant et après ranking ; pas de fuite via résultats agrégés.
- [ ] **T08.** Créer jobs de réindexation versions/document + reconciliation sur mutation/import/purge, traitement des modèles vectoriels incompatibles.
- [ ] **T09.** Fusionner FULLTEXT + vector + filtres via scoring documenté ; expliquer exact/estimé et ne pas présenter une propriété inconnue comme vraie.
- [ ] **T10.** Implémenter interface résultats, filtres composables, synonymes suggérés, résultats vides, erreurs provider et fallback texte si vector down.
- [ ] **T11.** Ajouter action « créer tenue depuis sélection », préparation sans enregistrement automatique et composant lookbook/filtres.
- [ ] **T12.** Mesurer latence et qualité corpus, détecter requêtes ambiguës; versionner dictionnaire et évaluer après chaque mise à jour.

## Contrats API / intégrations
`GET/POST /search/garments`, `/search/suggestions`, `/search/outfit-draft`, adapters `EmbeddingProvider` et `SearchRepository`. OpenAPI décrit filtre de propriété strict, modes recherche, score/justification et pagination.

## Schéma de données et migration
SearchDocument, SearchEmbedding, SearchIndexState, liens sources par id. Dimension fixe par modèle ; stratégie migration/reindexation lors du changement modèle, SQL migrations MariaDB VECTOR testées ; ne stocker aucun vecteur de photo user.

## Vérifications obligatoires
- [ ] Test corpus fr/en/ar/dialecte/fautes, avec topK attendu et métriques.
- [ ] Test de filtres exacts même si similarité sémantique élevée.
- [ ] Interuser leak = 0 ; exclus corbeille ; champs notes privés.
- [ ] Fournisseur embedding indisponible => recherche textuelle fonctionnelle.
- [ ] Indexation après création/modif/suppression/restauration ; aucun stale visible en contradiction filtres.
- [ ] Search texte <1s et sémantique <3s sous charge de référence.

## Critères d'acceptation du checkpoint CP-07
- [ ] Recherche trilingue évaluée, fallback fonctionnel.
- [ ] Index vectoriel et migration testés sous MariaDB réelle.
- [ ] Aucune donnée d’autres utilisateurs indexée dans espace accessible.

## Blocages / décisions à faire valider
- ADR-12 corpus et métriques de qualité à approuver.
- Choix provider embeddings, dimension VECTOR et coût à fixer.
- Support dialectes annoncé seulement pour lexique réellement testé.

## Livrables attendus de l'agent
- Code et migrations uniquement si approuvés ; références des commits/PRs, sans push automatique ni déploiement production.
- Documentation mise à jour : schémas API OpenAPI, ERD, écrans, traductions, paramètres et opérations concernées.
- Rapport vérifiable `Critère -> commande/test -> résultat -> preuve`; tout test non exécuté = `NOT RUN`, jamais `PASS`.
- Liste des risques restants et demande explicite de validation **CP-07** avant phase suivante.

## Règles transversales
Toutes les données privées vérifiées côté serveur ; TypeScript strict ; transactions/idempotence sur actions critiques ; tests FR/EN/AR et RTL, mobile, erreurs et a11y pertinents ; aucun secret/PII dans les logs ; workflows sans suppression ni automatisation implicite.

---

<!-- source: plans/08-events-travel-plan.md -->

# 08 — Événements récurrents, sport, voyages et valises

**Statut : PLAN À EXÉCUTER UNIQUEMENT APRÈS AUTORISATION.**  
**Prérequis :** CP-05 et CP-06 approuvés.  
**Validation de sortie :** CP-08.  
**Référence :** `../AGENTS.md`, `../docs/01-decisions-register.md`, `../docs/02-business-rules.md`, `../docs/09-acceptance-criteria.md`.

## Objectif et périmètre
Implémenter événements ponctuels/récurrents, exceptions, modèles, sport intérieur/extérieur, voyages multi-destinations, tenues quotidiennes, optimisation de valises, listes de préparation et conflits, sans automatisme d’état.

## Décisions non négociables
Récurrences à la demande, modification occurrence/suivantes/toute série, tenues phases avant/pendant/après, checklist libre hors inventaire, lavage prévu distinct du lavage réalisé, valise distincte du statut garment, conflits = avertir et alternative.

## Préparation — à produire AVANT toute modification
- [ ] Auditer le dépôt et comparer conventions, base, versions, migrations, endpoints et tests existants avec le périmètre de cette phase.
- [ ] Lire les ADR concernés dans `../docs/13-adr-open.md` ; les signaler comme **NON APPROUVÉS** et obtenir validation des choix bloquants.
- [ ] Présenter les changements envisagés, les interfaces touchées, les risques, les migrations et les commandes de vérification. Demander feu vert pour action destructive ou dépenses.

## Plan d'exécution détaillé
- [ ] **T01.** Créer événements titre/date/type obligatoires, heure/lieu/durée/notes facultatifs, modèles réutilisables avec tenue/checklist/paramètres.
- [ ] **T02.** Implémenter récurrence règles quotidien/hebdo/mensuel/intervalles/jours spécifiques/date fin, fuseau IANA et génération bornée d’occurrences à la demande.
- [ ] **T03.** Implémenter exception occurrence unique ; « modifier les suivantes » via scission/version de série ; « toute série » avec protection historique passé ; audit des éditions.
- [ ] **T04.** Construire calendrier événements et lien à tenue, phases avant/pendant/après avec plusieurs tenues/heure, sans port créé automatiquement.
- [ ] **T05.** Créer types sports standards + personnels et modèles de kit ; cas indoor/outdoor, météo trajet seulement si connue.
- [ ] **T06.** Créer checklist libre non vestimentaire (gourde/serviette/ballon) distincte du modèle Garment.
- [ ] **T07.** Créer voyage avec dates et plusieurs étapes villes/timezones, validation non-chevauchement ou ambiguïtés explicites, activités liées.
- [ ] **T08.** Concevoir moteur packing qui calcule besoins par jour, ≥1 tenue/jour ou plusieurs horaires, réutilisation et possibilité de lavage prévue mais non confirmée.
- [ ] **T09.** Ajouter bagage sac/cabine/soute, max pieces et poids si connu, estimation partielle explicitée et impossible constraints annoncées.
- [ ] **T10.** Ajouter liste de préparation à préparer/préparé/rangé et éléments manquants distincts, sans modifier garment.status.
- [ ] **T11.** Comparer collisions de la même fiche physique entre trip/outfit/événements, proposer remplacement et laisser confirmer ou conserver.
- [ ] **T12.** Réévaluer suggestions d’une valise si météo devient défavorable, notifier sans remplacer la liste existante.
- [ ] **T13.** Tester récurrence DST, réutilisation, séjours multi-villes, nettoyage des liens après suppression d’une pièce.

## Contrats API / intégrations
`/events`, `/event-series`, `/event-series/{id}/occurrences`, `/event-series/{id}/exceptions`, `/event-templates`, `/trips`, `/trips/{id}/stages`, `/trips/{id}/packing-suggestion`, `/suitcases`, checklists. Mutation séries exige scope explicite `one/following/all`.

## Schéma de données et migration
Event/EventSeries/RecurrenceRule/EventException/EventTemplate/Checklist, Trip/TripStage/Suitcase/SuitcaseItem/PackingChecklist/TravelLaundryPlan, liens avec Outfit. Occurrence virtuelle a clé stable `seriesId+originalLocalOccurrence`; UTC + TZ IANA ; pas de stockage infini.

## Vérifications obligatoires
- [ ] Modifier une occurrence ne touche pas autres ; les suivantes ne réécrivent pas passé.
- [ ] Récurrences DST Europe/Paris printemps/automne, dates inexistantes/ambiguës.
- [ ] Sport intérieur/extérieur et objets checklist libres.
- [ ] Voyage 2 villes, plusieurs tenues/jour, poids absent et nombre limite.
- [ ] Lavage prévu ne change pas état réel ; item packing ne change pas garment.status.
- [ ] Conflits valise/tenue => choix et alternative, pas écrasement.
- [ ] Changement météo => une proposition non destructive.
- [ ] Suppression/restauration vêtement et références travel.

## Critères d'acceptation du checkpoint CP-08
- [ ] Récurrences et exceptions fonctionnent sans générer des milliers de lignes.
- [ ] Voyage multi-étapes et checklist par activité cohérents.
- [ ] Aucun port ou lavage enregistré automatiquement.

## Blocages / décisions à faire valider
- ADR-03 horizon des rappels pour occurrences non matérialisées à valider.
- Politique heure locale DST ambiguë/absente à valider.
- Comment gérer un voyage en cours lorsque pièce devient À laver ou supprimée.

## Livrables attendus de l'agent
- Code et migrations uniquement si approuvés ; références des commits/PRs, sans push automatique ni déploiement production.
- Documentation mise à jour : schémas API OpenAPI, ERD, écrans, traductions, paramètres et opérations concernées.
- Rapport vérifiable `Critère -> commande/test -> résultat -> preuve`; tout test non exécuté = `NOT RUN`, jamais `PASS`.
- Liste des risques restants et demande explicite de validation **CP-08** avant phase suivante.

## Règles transversales
Toutes les données privées vérifiées côté serveur ; TypeScript strict ; transactions/idempotence sur actions critiques ; tests FR/EN/AR et RTL, mobile, erreurs et a11y pertinents ; aucun secret/PII dans les logs ; workflows sans suppression ni automatisation implicite.

---

<!-- source: plans/09-notifications-plan.md -->

# 09 — Centre de notifications, Web Push VAPID et rappels

**Statut : PLAN À EXÉCUTER UNIQUEMENT APRÈS AUTORISATION.**  
**Prérequis :** CP-03, CP-06 et CP-08 approuvés.  
**Validation de sortie :** CP-09.  
**Référence :** `../AGENTS.md`, `../docs/01-decisions-register.md`, `../docs/02-business-rules.md`, `../docs/09-acceptance-criteria.md`.

## Objectif et périmètre
Implémenter les rappels privés en centre in-app et Web Push VAPID autorisé, pour tenue/météo/événements/valises, réglables par catégorie et appareil avec heures personnalisées, quiet hours, dédoublonnage et purge 90 jours.

## Décisions non négociables
Push seulement après geste utilisateur, compatibilité navigateur/iOS PWA vérifiée ; centre fonctionne si push refusé ; aucune notification inutile à chaque évolution météo ; pas de remplacement automatique de tenues/valises.

## Préparation — à produire AVANT toute modification
- [ ] Auditer le dépôt et comparer conventions, base, versions, migrations, endpoints et tests existants avec le périmètre de cette phase.
- [ ] Lire les ADR concernés dans `../docs/13-adr-open.md` ; les signaler comme **NON APPROUVÉS** et obtenir validation des choix bloquants.
- [ ] Présenter les changements envisagés, les interfaces touchées, les risques, les migrations et les commandes de vérification. Demander feu vert pour action destructive ou dépenses.

## Plan d'exécution détaillé
- [ ] **T01.** Créer Notification, Device, PushSubscription, ReminderRule, DeliveryAttempt/ScheduledIntent avec owner scope, statut lecture et expireAt 90j.
- [ ] **T02.** Implémenter centre de notifications (liste, détails/deep link, lu/non lu, suppression) et états vides FR/EN/AR.
- [ ] **T03.** Créer UI explicative préalable à la permission et déclencher permission push dans interaction explicite ; ne pas demander à la première visite.
- [ ] **T04.** Implémenter enregistrement/désactivation de souscription individuelle par installation/appareil avec expiration/nettoyage, VAPID secrets côté serveur.
- [ ] **T05.** Configurer catégories tenues/météo/événements/valises et plusieurs offsets par occurrence (J-1/H-1), fuseaux IANA.
- [ ] **T06.** Implémenter plage silencieuse traversant minuit et politique report/expires, sans envoi tardif absurde.
- [ ] **T07.** Concevoir intentions de rappel durables et workers BullMQ idempotents avec dedupe notification×device×trigger, retries limités.
- [ ] **T08.** Intégrer modifications/annulations d’occurrences et voyages : recalcul et invalidation jobs obsolètes ; aucun rappel annulé envoyé.
- [ ] **T09.** Intégrer alertes météo uniquement lorsque règles fixes déterminent un effet significatif sur tenue/valise, pas variation légère.
- [ ] **T10.** Limiter contenu push visible sur écran verrouillé, traduire message selon utilisateur ; deep link exige auth.
- [ ] **T11.** Ajouter métriques de livraisons/échecs, purges à 90j et audits minimaux sans payload sensible.
- [ ] **T12.** Tester navigateurs cibles, push denied, appareils multiples, périodicité et changements DST.

## Contrats API / intégrations
`/notifications`, `/reminder-preferences`, `/push-subscriptions`, endpoints read/delete et device disable ; worker `NotificationDispatcher`, `ReminderPlanner`, `PushTransport` ; service worker Web Push seulement si permission.

## Schéma de données et migration
Notification, ReminderRule, Device, PushSubscription, NotificationDelivery, ScheduledIntent, retenue 90j ; idempotence stable et expirations. Chiffrer/limiter payload subscription sensible.

## Vérifications obligatoires
- [ ] Centre fonctionne sans permission ou sans service push.
- [ ] Permission contextualisée, iOS home-screen uniquement si conditions remplies.
- [ ] Appareil désactivé ne reçoit plus rien ; autres restent actifs.
- [ ] J-1/H-1 et quietHours 22-08 dans zone donnée, DST.
- [ ] Aucune notification en double sur retries/replanifications.
- [ ] Changement météo mineur = aucun push ; changement pertinent = lien non destructif.
- [ ] Notifications expirées purgées à 90 jours.

## Critères d'acceptation du checkpoint CP-09
- [ ] Notifications privées fiables et paramétrables.
- [ ] Pas de double notification ni violation plage silencieuse.
- [ ] Tests de support et limitations iOS/Android documentés.

## Blocages / décisions à faire valider
- ADR-07 catégorie désactivée et centre in-app non approuvé.
- Règle exacte report vs expiration pendant quiet hours à préciser.
- Fréquence polling météo et politique de taux de notifications, budgets web push.

## Livrables attendus de l'agent
- Code et migrations uniquement si approuvés ; références des commits/PRs, sans push automatique ni déploiement production.
- Documentation mise à jour : schémas API OpenAPI, ERD, écrans, traductions, paramètres et opérations concernées.
- Rapport vérifiable `Critère -> commande/test -> résultat -> preuve`; tout test non exécuté = `NOT RUN`, jamais `PASS`.
- Liste des risques restants et demande explicite de validation **CP-09** avant phase suivante.

## Règles transversales
Toutes les données privées vérifiées côté serveur ; TypeScript strict ; transactions/idempotence sur actions critiques ; tests FR/EN/AR et RTL, mobile, erreurs et a11y pertinents ; aucun secret/PII dans les logs ; workflows sans suppression ni automatisation implicite.

---

<!-- source: plans/10-analytics-import-export-plan.md -->

# 10 — Statistiques, coût par port, archives import/export

**Statut : PLAN À EXÉCUTER UNIQUEMENT APRÈS AUTORISATION.**  
**Prérequis :** CP-04, CP-05, CP-08 approuvés.  
**Validation de sortie :** CP-10.  
**Référence :** `../AGENTS.md`, `../docs/01-decisions-register.md`, `../docs/02-business-rules.md`, `../docs/09-acceptance-criteria.md`.

## Objectif et périmètre
Implémenter les analyses du dressing depuis vrais ports confirmés et achats renseignés, ainsi qu’archive d’export complète et réimport sécurisé avec aperçu, doublons suggérés et mapping de photos/relations.

## Décisions non négociables
Aucune planification prise comme port, seuil oublié 90j modifiable, coût/port seulement si prix et ports >0, monnaies distinctes, pièces actives sur période hors corbeille, import n’autofusionne jamais les vêtements et export exclut secrets.

## Préparation — à produire AVANT toute modification
- [ ] Auditer le dépôt et comparer conventions, base, versions, migrations, endpoints et tests existants avec le périmètre de cette phase.
- [ ] Lire les ADR concernés dans `../docs/13-adr-open.md` ; les signaler comme **NON APPROUVÉS** et obtenir validation des choix bloquants.
- [ ] Présenter les changements envisagés, les interfaces touchées, les risques, les migrations et les commandes de vérification. Demander feu vert pour action destructive ou dépenses.

## Plan d'exécution détaillé
- [ ] **T01.** Préciser dénominateur et fenêtre de taux d’utilisation : pièces éligibles actives pendant partie de la période, filtres saison/disponibilité et corbeille, avec audit de définition.
- [ ] **T02.** Implémenter agrégats nombre d’articles, catégories, saisons, états, occasions, tendances hebdo/mensuelles et dernière/3 utilisations.
- [ ] **T03.** Calculer pièces les plus/moins portées sur WearRecordItem actifs, différencier port absent et pièce jamais portée en réalité.
- [ ] **T04.** Implémenter threshold de pièce oubliée 90j par défaut, réglable, respect date création, saison, disponibilité et filtres.
- [ ] **T05.** Implémenter prix/date/devise facultatifs, coût par port et tendances dépenses seulement dates connues ; montants par devise, nulls affichés.
- [ ] **T06.** Créer dashboard responsive, graphiques accessibles, UI filtres période, expliciter numérateur/dénominateur/échantillon et données manquantes.
- [ ] **T07.** Définir manifest versionné archive JSON + photos, métadonnées, checksums, relations et formats de date ; ne jamais exporter secret ni identifiant d’autre compte.
- [ ] **T08.** Implémenter export asynchrone objet privé expiration courte, authentification et mesures anti-accès interuser.
- [ ] **T09.** Implémenter préanalyse import contrôlée : limite taille, zip-slip/zip-bomb, MIME, schéma/version, checksum, référentiels et doublons potentiels.
- [ ] **T10.** Afficher aperçu import avec choix pour chaque doublon suspect : ignorer ou nouvelle pièce ; jamais fusion automatique.
- [ ] **T11.** Importer avec clés/nouveaux IDs et mapping des FK (photos/sets/collections/outfits), batch transaction/compensation contrôlés, rapport détaillé et reprise idempotente.
- [ ] **T12.** Tester purge des images exportées expirées, export de compte complet et suppression compte impact objets d’export.
- [ ] **T13.** Réaliser tests analytiques avec corrections de ports et données multicurrencies, imports malveillants et restaurations fiables.

## Contrats API / intégrations
`/analytics`, `/analytics/wardrobe`, `/analytics/garments/{id}`, `/imports`, `/imports/{id}/preview`, `/imports/{id}/confirm`, `/exports`, `/exports/{id}` ; jobs worker avec endpoint de statut et URLs privées temporaires.

## Schéma de données et migration
Agrégations depuis WearRecord et achats; caches invalidables, aucun conflit source de vérité. ImportJob, ExportJob, IdempotencyRecord, manifest Version ; mapping ID source->dest et relation ; ne pas persister photo sans fiche validée.

## Vérifications obligatoires
- [ ] Statistiques 3 dernières utilisations, corrections et plusieurs ports même date.
- [ ] Coût/port 100€ / 10 => 10€, zéro port => non calculable.
- [ ] Achat EUR/TND non additionné arbitrairement, null prix != zéro.
- [ ] Pièce oubliée 90j réglable, saison exclue, nouvelle pièce protégée.
- [ ] Export contiendra photos et données du périmètre sans secret.
- [ ] Import archive hostile rejeté, collisions éventuelles demandent choix, retry sans doublons.
- [ ] Fichier photo de compte B interdit par compte A, export accès expiré.

## Critères d'acceptation du checkpoint CP-10
- [ ] Dashboard calculé depuis sources correctes avec données manquantes explicites.
- [ ] Export portable et import réversible contrôlé, sans fuite de secrets.
- [ ] Aucun doublon ni corruption sur répétition ou échec.

## Blocages / décisions à faire valider
- ADR-04 taux exact, ADR-05 stratégie détection doublons, ADR-06 données historiques après purge.
- Limites d’archives, rétention exports et stratégie des versions d’archive.
- Conversion de devises non décidée : présenter séparément tant que pas validée.

## Livrables attendus de l'agent
- Code et migrations uniquement si approuvés ; références des commits/PRs, sans push automatique ni déploiement production.
- Documentation mise à jour : schémas API OpenAPI, ERD, écrans, traductions, paramètres et opérations concernées.
- Rapport vérifiable `Critère -> commande/test -> résultat -> preuve`; tout test non exécuté = `NOT RUN`, jamais `PASS`.
- Liste des risques restants et demande explicite de validation **CP-10** avant phase suivante.

## Règles transversales
Toutes les données privées vérifiées côté serveur ; TypeScript strict ; transactions/idempotence sur actions critiques ; tests FR/EN/AR et RTL, mobile, erreurs et a11y pertinents ; aucun secret/PII dans les logs ; workflows sans suppression ni automatisation implicite.

---

<!-- source: plans/11-offline-pwa-sync-plan.md -->

# 11 — PWA installable, cache privé et synchronisation de nouveaux brouillons

**Statut : PLAN À EXÉCUTER UNIQUEMENT APRÈS AUTORISATION.**  
**Prérequis :** CP-04 et CP-05 approuvés.  
**Validation de sortie :** CP-11.  
**Référence :** `../AGENTS.md`, `../docs/01-decisions-register.md`, `../docs/02-business-rules.md`, `../docs/09-acceptance-criteria.md`.

## Objectif et périmètre
Rendre l’application installable, permettre consultation des dernières données en cache privé et création hors ligne de **nouveaux** brouillons vêtements/tenues uniquement, puis synchronisation idempotente et résolution non destructive des conflits.

## Décisions non négociables
Ne pas permettre modification offline de fiches/tenues déjà synchronisées. Un draft local n’est jamais annoncé comme sauvegardé serveur. Pas de confiance dans les statuts de cache, photos privées isolées par compte, possibilité de déconnexion d’appareil partagé.

## Préparation — à produire AVANT toute modification
- [ ] Auditer le dépôt et comparer conventions, base, versions, migrations, endpoints et tests existants avec le périmètre de cette phase.
- [ ] Lire les ADR concernés dans `../docs/13-adr-open.md` ; les signaler comme **NON APPROUVÉS** et obtenir validation des choix bloquants.
- [ ] Présenter les changements envisagés, les interfaces touchées, les risques, les migrations et les commandes de vérification. Demander feu vert pour action destructive ou dépenses.

## Plan d'exécution détaillé
- [ ] **T01.** Ajouter PWA manifest/icon/splash et service worker compatible architecture Next.js, vérifier HTTPS et prise en charge Android/iPhone/desktop.
- [ ] **T02.** Définir politique cache : shell, assets publics, données privées conservées volontairement, durée/volume/éviction, aucune réponse privée d’autre compte.
- [ ] **T03.** Concevoir stockage local IndexedDB structuré avec identité de compte, brouillons, photos éventuelles, clientDraftId, version et statut de sync.
- [ ] **T04.** Autoriser hors ligne création de fiche vêtement **nouvelle** avec champs obligatoires localement, photo locale possible si quota ; validation serveur à synchronisation.
- [ ] **T05.** Autoriser hors ligne composition **nouvelle** de tenue brouillon à partir de références déjà disponibles localement ; indiquer données susceptibles d’être obsolètes.
- [ ] **T06.** Désactiver/indiquer comme indisponibles modifications d’existant, port confirmé, lavage, import cloud, push et météo fraîche sans connexion.
- [ ] **T07.** Implémenter sync `clientOperationId` stable, mapping draft IDs/serveur, idempotence en DB, rejets structurés, gestion dépendances entre drafts.
- [ ] **T08.** Détecter conflits ressources invalidées (vêtement supprimé, changé de statut), conserver brouillon et afficher options sans écrasement silencieux.
- [ ] **T09.** Gérer perte réseau en pleine sync, retry même clé et reprise batch partielle, sans double-creation ni disparition photo.
- [ ] **T10.** Implémenter déconnexion/protection du cache, refus que le second compte voit photos/brouillons du premier, demander choix pour drafts non synchros sans fuite.
- [ ] **T11.** Créer écran statut synchronisation (en attente, en cours, succès, erreur, conflit) avec feedback accessible FR/EN/AR.
- [ ] **T12.** Tester iOS Safari PWA limites (Push installée, cache), Android, Chrome/Firefox/Safari/Edge cible et mode privée/stockage faible.

## Contrats API / intégrations
`POST /sync/batches`, mapping local->server, endpoints auth session ; Service Worker/IndexedDB uniquement pour browser, adapter `LocalDraftStore`. Les appels critiques doivent inclure idempotency key et détail par opération.

## Schéma de données et migration
Les drafts vivent en stockage local, pas dans DB avant sync réussie. IdempotencyRecord et mapping client draft garantissent unique création ; Garment et Outfit serveur revalident les règles SF-02/03.

## Vérifications obligatoires
- [ ] Offline cache affiche uniquement données du compte autorisé, signalées comme possiblement périmées.
- [ ] Créer brouillon nouveau vêtement avec photo et brouillon tenue hors ligne.
- [ ] Modifier une fiche serveur offline est impossible et clairement signalé.
- [ ] Réseau coupé pendant sync + retry => une seule fiche créée.
- [ ] Compte A logout puis B login : cache A non accessible.
- [ ] Conflit vêtement supprimé côté serveur => brouillon local conservé.
- [ ] PWA installable sur environnement compatible ; limites documentées.

## Critères d'acceptation du checkpoint CP-11
- [ ] PWA installe et fonctionne pour périmètre hors ligne validé.
- [ ] Synchronisation prouvée idempotente et sûre.
- [ ] Aucun accès intercompte via cache ni faux succès serveur.

## Blocages / décisions à faire valider
- Politique de purge des drafts non synchronisés lors de logout ou suppression compte.
- Capacité IndexedDB/cache et conservation photos offline selon mobile.
- Précision de « garder les deux versions si nécessaire » pour les cas d’édition/creation concurrentes.

## Livrables attendus de l'agent
- Code et migrations uniquement si approuvés ; références des commits/PRs, sans push automatique ni déploiement production.
- Documentation mise à jour : schémas API OpenAPI, ERD, écrans, traductions, paramètres et opérations concernées.
- Rapport vérifiable `Critère -> commande/test -> résultat -> preuve`; tout test non exécuté = `NOT RUN`, jamais `PASS`.
- Liste des risques restants et demande explicite de validation **CP-11** avant phase suivante.

## Règles transversales
Toutes les données privées vérifiées côté serveur ; TypeScript strict ; transactions/idempotence sur actions critiques ; tests FR/EN/AR et RTL, mobile, erreurs et a11y pertinents ; aucun secret/PII dans les logs ; workflows sans suppression ni automatisation implicite.

---

<!-- source: plans/12-security-performance-deployment-plan.md -->

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

---

<!-- source: plans/13-final-acceptance-plan.md -->

# 13 — Recette finale V1, anomalies et décision de lancement

**Statut : PLAN À EXÉCUTER UNIQUEMENT APRÈS AUTORISATION.**  
**Prérequis :** CP-01 à CP-12 passés ou exceptions documentées et approuvées.  
**Validation de sortie :** CP-13.  
**Référence :** `../AGENTS.md`, `../docs/01-decisions-register.md`, `../docs/02-business-rules.md`, `../docs/09-acceptance-criteria.md`.

## Objectif et périmètre
Faire la recette indépendante de tous les parcours SF-01..08/PWA, mesurer risques résiduels, corriger les défauts autorisés et soumettre un rapport final GO/NO-GO au propriétaire. L’absence d’erreurs non détectées ne se prouve pas par simple déclaration.

## Décisions non négociables
Version 1 complète sans fonction supprimée arbitrairement ; preuves des 24 scénarios G et critères détaillés ; production seulement après approbation ; aucune invention de résultats de test, pas de report silencieux d’exigences.

## Préparation — à produire AVANT toute modification
- [ ] Auditer le dépôt et comparer conventions, base, versions, migrations, endpoints et tests existants avec le périmètre de cette phase.
- [ ] Lire les ADR concernés dans `../docs/13-adr-open.md` ; les signaler comme **NON APPROUVÉS** et obtenir validation des choix bloquants.
- [ ] Présenter les changements envisagés, les interfaces touchées, les risques, les migrations et les commandes de vérification. Demander feu vert pour action destructive ou dépenses.

## Plan d'exécution détaillé
- [ ] **T01.** Assembler matrice de traçabilité requirement ID -> composant/migration/API -> tests -> preuves ; lister les exigences NOT RUN.
- [ ] **T02.** Créer environnement recette vierge, jeu de données synthétique multilingue et 2 comptes, plan migration production simulée.
- [ ] **T03.** Exécuter SF-01 auth/onboarding/effacement/export et tests révocation session/appareils.
- [ ] **T04.** Exécuter SF-02 classification, inventaire, photo 5x10Mo, duplication, états, bulk, corbeille et import/export.
- [ ] **T05.** Exécuter SF-03 composition multi-tenues/jour, suggestions 3, météo, IA off, feedback, port puis lavage facultatif, corrections.
- [ ] **T06.** Exécuter SF-04 historique/statistiques/coût/port/oubli 90j et monnaie/missing values.
- [ ] **T07.** Exécuter SF-05 récurrences DST/exception/sport/voyage multi-étapes/valise/lavage supposé/conflits.
- [ ] **T08.** Exécuter SF-06 corpus FR/EN/AR/dialectes, synonymes, filtres exacts, recherche vector fallback.
- [ ] **T09.** Exécuter SF-07 Push permission/centre, devices, quietHours, notifications J-1/H-1 et purge 90j.
- [ ] **T10.** Exécuter SF-08 RTL/mixte, dates et nombres, et PWA offline/photo/sync conflits/2 comptes.
- [ ] **T11.** Exécuter sécurité interuser, imports hostiles, URL photos, redaction PII, log retention, backup restore, charge et a11y.
- [ ] **T12.** Classifier anomalies P0 sécurité/data loss, P1 parcours critique, P2 UX, P3 cosmétique ; P0/P1 ouverts bloquent le GO.
- [ ] **T13.** Produire rapport consolidé, limites navigateurs, coûts, fournisseurs, risques, procédures et liste des décisions encore ouvertes.
- [ ] **T14.** Soumettre GO/NO-GO au propriétaire, recevoir accord explicite avant toute publication ou push sur main.

## Contrats API / intégrations
Audit de tous endpoints décrits dans `docs/07-api-contracts.md` et OpenAPI généré, conformité response/status/error. Enregistrer toute divergence comme anomalie, pas comme documentation adaptée a posteriori sans revue.

## Schéma de données et migration
Vérifier migrations sur DB neuve et reprise d’une base de préprod, intégrité FK et snapshots, données compte supprimées, objets correspondants et cleanup. Aucun changement de schéma non revu pendant recette.

## Vérifications obligatoires
- [ ] G-01..G-24 exécutés avec preuves et résultats PASS/FAIL/NOT RUN.
- [ ] Couverture UC SF-01..08 et règles transversales tracée.
- [ ] Tests 2 comptes et photo/fichier export privé.
- [ ] Benchmark latence et exercice RPO/RTO effectifs, pas seulement estimations.
- [ ] WCAG AA contrôlé manuellement+automatiquement.
- [ ] Essais browser matrix, iOS et Android PWA, RTL et offline.
- [ ] Absence de bug P0/P1 ouvert avant GO.

## Critères d'acceptation du checkpoint CP-13
- [ ] Matrice exigence->preuve complète et accessible.
- [ ] Rapport GO/NO-GO factuel remis.
- [ ] Décision de production prise explicitement par le propriétaire, non par l’agent.

## Blocages / décisions à faire valider
- Nouveaux écarts vs exigences nécessitent validation utilisateur (pas de réduction silencieuse).
- Fournisseurs et budgets finaux approuvés et contractualisés avant prod.
- Aucune publication tant que GO non explicitement donné.

## Livrables attendus de l'agent
- Code et migrations uniquement si approuvés ; références des commits/PRs, sans push automatique ni déploiement production.
- Documentation mise à jour : schémas API OpenAPI, ERD, écrans, traductions, paramètres et opérations concernées.
- Rapport vérifiable `Critère -> commande/test -> résultat -> preuve`; tout test non exécuté = `NOT RUN`, jamais `PASS`.
- Liste des risques restants et demande explicite de validation **CP-13** avant phase suivante.

## Règles transversales
Toutes les données privées vérifiées côté serveur ; TypeScript strict ; transactions/idempotence sur actions critiques ; tests FR/EN/AR et RTL, mobile, erreurs et a11y pertinents ; aucun secret/PII dans les logs ; workflows sans suppression ni automatisation implicite.
