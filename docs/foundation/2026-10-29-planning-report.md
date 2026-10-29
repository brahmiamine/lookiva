# Plan 08 — événements et voyages : première tranche

Travail sur la branche work, en conservant la recherche et les corrections précédentes. Aucun push/déploiement.

## Livré

- Module planning, migration additive PlannerEntry avec ownerId/kind/version et payload strictement validé.
- CRUD événements/voyages : session, CSRF, idempotence création, compare-and-set et If-Match en modification/suppression, pagination et rate limit.
- Événements locaux à la journée avec type, sport intérieur/extérieur, notes/checklist, fuseau IANA ; récurrences quotidiennes/hebdomadaires/mensuelles à intervalle et fin facultative. Génération virtuelle bornée, pas d'UTC inventé pour une heure DST ambiguë.
- Voyage multi-étapes côté API : 30 étapes, dates dans le séjour et sans chevauchement ; 100 pièces distinctes maximum, contrôle propriétaire et corbeille à l'ajout ; capacité en pièces facultative, poids explicitement inconnu, avertissements de disponibilité.
- Écran planning FR/EN/AR, formulaires événement/voyage (une ville dans cette première UI), pagination, notes, liste libre à cocher avec persistance, confirmation de suppression, affichage d'occurrences.
- OpenAPI et README synchronisés. Aucun état de vêtement ni historique de port modifié automatiquement.

## Revue Superpowers

Revue indépendante du module/API/UI/migration/tests : quatre constats corrigés et couverts par régressions.
1. Dates invalides de voyage : erreurs de validation au lieu d'une exception serveur.
2. Les vêtements déjà sélectionnés puis supprimés ne bloquent plus les éditions de checklist ; l'avertissement MISSING reste visible côté préparation.
3. Une création de voyage rejouée conserve sa réponse après suppression d'un vêtement : validation mutable placée dans le callback de première exécution idempotente.
4. Cliquer l'onglet déjà actif ne vide plus la liste affichée.

## Décisions d'implémentation et limites

- Documents JSON validés et bornés dans un module dédié : permet cette première livraison avec une migration additive ; les requêtes de calendrier/indexation plus avancées pourront nécessiter une projection normalisée.
- Dates à la journée seulement : aucune politique d'heure inexistante/ambiguë n'est prise au nom du produit. Les heures précises, rappels et exceptions one/following/all ne sont pas livrés.
- La modification complète d'un document via PUT n'est pas une API de modification de série avec protection de l'historique ; cette fonction reste à développer avant CP-08.
- Pas encore de modèles d'événements, association de tenues par phase, suggestions météo/optimisation de valise, UI multi-étapes et inventaire, ou alertes de collision.
- Les phases 09 à 13 et les parties restantes des phases 07/08 restent ouvertes. Aucune prétention que tous les plans sont terminés.

## Vérifications

Tests de domaine/schémas/UI et intégrations MariaDB/Redis exécutés ; résultats finaux consignés à la fin de ce fichier.
La migration additive a été appliquée avec succès sur une base Docker jetable contenant le schéma courant.
Comme lors de la tranche précédente, la préparation exclut uniquement les deux migrations historiques incohérentes de main ; cela ne valide pas la chaîne complète ni une migration d'une base installée.
Client Prisma généré avec le générateur officiel 7.10.1 en processus, sans téléchargement natif.
Les contraintes réseau précédentes et le décalage Node/pnpm restent identiques au rapport de continuation.
E2E navigateur et contrôle visuel RTL réel non exécutés : Chromium reste indisponible dans cet environnement.

Contrôle complémentaire : les reprises réseau d'une création UI conservent la même clé d'idempotence et le même corps (y compris les IDs de checklist). Régression observée RED puis GREEN.

Résultats : intégration complète sur schéma temporaire PASS (22 fichiers, 282 tests). Lint, boundaries, OpenAPI, TypeScript et scan de secrets PASS. Le build de production a passé et est rejoué après la dernière correction UI.

Validation finale : **402 tests unitaires PASS** (64 fichiers), **282 tests d'intégration PASS** (22 fichiers, schéma temporaire préparé), **build Next.js webpack PASS**, TypeScript/lint/boundaries/OpenAPI/scan secrets/diff-check PASS. Infrastructure jetable retirée. Tests navigateur non exécutés ; chaîne de migrations historique non validée. Aucun checkpoint global ni achèvement des plans 00–13 n'est revendiqué.
