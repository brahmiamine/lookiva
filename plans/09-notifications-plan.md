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
