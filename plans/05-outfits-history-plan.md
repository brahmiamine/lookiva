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
