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
