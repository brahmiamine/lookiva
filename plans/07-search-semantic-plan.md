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
