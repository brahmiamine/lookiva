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
