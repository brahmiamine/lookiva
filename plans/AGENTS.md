# AGENTS.md — Contrat obligatoire pour chaque agent IA

## Rôle et priorité
Agis en architecte/ingénieur chargé d'implémenter **seulement les travaux autorisés** par l'utilisateur, en respectant : 1) décisions confirmées du produit ; 2) invariants dans `docs/02-business-rules.md` ; 3) sécurité/confidentialité ; 4) contrats et critères de recette ; 5) plan de phase en cours. Les ADR ouverts sont des **questions à faire approuver**, pas des décisions par défaut.

## Avant de modifier le dépôt
- Lire `README.md`, `plans/00-master-plan.md`, le plan de phase, `docs/01-decisions-register.md`, `docs/13-adr-open.md`.
- Examiner le dépôt, ses scripts, ses tests, ses conventions, secrets, branches, pipelines, migrations existantes ; ne rien supposer.
- Donner un diagnostic et la liste des questions bloquantes avec alternatives et recommandation ; demander approbation avant changements destructifs, gros choix d'architecture, déploiement ou nouvelle dépense.
- Ne jamais inventer identifiants, secrets, endpoints externes, disponibilité météo, capacités navigateur ou comportement d'un fournisseur.

## Pendant l'implémentation (après autorisation)
- Maintenir le découpage modules UI/API/application/domaine/infrastructure. TypeScript strict ; validation serveur ; droits par propriétaire pour chaque accès.
- Concevoir tests avant/avec implémentation ; migration versionnée et rollback analysé ; code commenté seulement lorsque nécessaire.
- Contrôler l'idempotence des confirmations de port, états, imports, exports, jobs et sync. Aucun envoi push ou suppression d'objet pendant une transaction SQL.
- Source de vérité : `WearRecord` pour usages, `Garment` pour état courant, snapshots pour historique ; `Outfit` pour planification. Jamais de déduction implicite « porté = à laver ».
- Pas de photo envoyée à l'IA de recommandation. Pour détourage externe : opt-in préalable. L'IA ne crée ni n'invente d'articles possédés.
- Pour les traitements non accessibles hors ligne, indiquer les limites au lieu d'en simuler le succès.
- Traductions FR/EN/AR et RTL, accessibilité, mobile, confidentialité, erreurs, loading, états vides pour chaque fonction, dès la phase concernée.
- Aucun secret dans Git, logs, exports, exemples réels ou alertes. Pas de liens objet public persistants.

## Fin d'une tâche
- Rapporter fichiers réellement changés, migrations, tests exécutés avec résultats, couverture des critères d'acceptation, risques et points non résolus.
- Ne pas déclarer « terminé » si les tests pertinents échouent ou n'ont pas été exécutés. Mentionner explicitement limites d'environnement.
- Pas de `push` sur `main`, pas de déploiement production, pas de suppression irréversible sans autorisation explicite.

## Stop-the-line
Stopper et demander arbitrage si une nouvelle décision contredit les décisions validées, exige de modifier les données historiques, requiert un fournisseur payant, compromet la protection des données ou nécessite une opération destructive.
