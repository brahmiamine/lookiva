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
