# Activité — statistiques et rappels internes

## Livré

Modules analytics et notifications, route privée activity dans les trois langues, migration additive
Notification/NotificationPreference et job worker toutes les cinq minutes. L'existant et la branche work
sont conservés ; aucun push Git, déploiement ou envoi de notification externe.

Statistiques : uniquement vrais ports ACTIVE ; période UTC pour les utilisations, inventaire courant hors
corbeille créé avant la fin de période pour le dénominateur ; coût/port et oubli depuis l'historique complet,
prix/devise absents non inventés, devises séparées, dernières trois utilisations. La définition et les limites
sont affichées/documentées. Le lecteur utilise un snapshot RepeatableRead et des capacités explicites.

Notifications : opt-in par défaut désactivé ; délai 15–1440 minutes ; sources PLANNED réelles seulement,
clé de dédoublonnage compte + tenue + instant ; revalidation des sources lors de la lecture ; marqueurs de
suppression empêchant la réapparition ; purge à 90j ; isolation entre comptes et erreurs worker isolées.
Les messages in-app génériques ne dévoilent aucun titre personnel sur un écran verrouillé : aucun push n'existe.

## Revue et corrections

Revue indépendante des API/UI/schema/migration/statistiques : défaut confirmé d'isolation des erreurs worker.
Une erreur/capacité dépassée sur un propriétaire interrompait les suivants. Régression RED→GREEN : le job
continue maintenant sur les autres comptes et rapporte les erreurs au logger du worker.
Contrôle complémentaire RED→GREEN : un vêtement/port exactement à l'instant de l'horloge doit être inclus.
Les calculs utilisent un regroupement linéaire des ports plutôt qu'un filtrage répété de tout l'historique.

## Décisions et périmètre restant

- Pas de conversion monétaire. Coût/port sur tout l'historique confirmé ; statistiques d'utilisation sur période.
- Dénominateur transparent d'inventaire courant, pas d'inférence d'historique de présence absent du modèle.
- Opt-in pour rappels in-app ; désactivation arrête les balayages futurs, conserve le centre déjà existant.
- Sources limitées aux tenues, pas encore événements/valises. Vérification périodique, pas de promesse à la minute.
- Web Push, quiet hours, préférences par appareil et import/export complet restent à développer ; CP-09 et CP-10 ne sont pas validés.
- Contraintes d'environnement et migrations historiques incohérentes identiques aux rapports précédents : la base jetable est préparée avec le schéma actuel en écartant les deux migrations legacy problématiques. Pas de validation de la chaîne complète ni mutation d'une base utilisateur.
- Node 24.19.0/pnpm 11.25.0 exécutés, sous les pins du projet. Client Prisma généré via le générateur officiel 7.10.1 en processus. Tests navigateur/RTL réels non exécutés faute de Chromium autorisé.

## Vérifications

Résultats finaux ajoutés après la fin des suites. Tests ciblés couvrent opt-in, dédoublonnage, suppression,
replanification/annulation, expiration, IDOR, erreurs worker indépendantes, stocks privés/corbeille,
invalidations de port, devises/prix absents, fenêtre de dates, coût lifetime et UI lecture/suppression/statistiques.

Validation finale : **409 tests unitaires PASS** (67 fichiers), **284 tests d'intégration PASS** (23 fichiers, schéma temporaire préparé), **build Next.js webpack PASS**, **bundle worker PASS**, lint/TypeScript/boundaries/OpenAPI/scan secrets/diff-check PASS. Migration additive testée sur MariaDB réelle. Infrastructure jetable retirée en fin de tâche. Aucun test navigateur réel ni validation de la chaîne historique de migrations ; aucun achèvement global des plans n'est revendiqué.
