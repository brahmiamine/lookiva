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
