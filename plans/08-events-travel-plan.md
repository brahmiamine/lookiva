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
