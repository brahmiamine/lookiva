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
