# Statistiques et centre de notifications
Spec : plans/09-notifications-plan.md, plans/10-analytics-import-export-plan.md.
Exécution continue sur work autorisée par la demande de poursuivre tout le développement.
- [x] Statistiques depuis vêtements courants et vrais ports actifs, coût/port nullable, devises séparées, seuil oubli configurable ; API propriétaire et tableau FR/EN/AR.
- [x] Centre in-app persistant, préférences opt-in, rappels de tenues planifiées, dédoublonnage, lecture/suppression et expiration 90j ; worker périodique.
- [x] Tests RED/GREEN domaine et intégration (isolation, retries, invalidation), UI, OpenAPI, migration additive, vérifications et revue.
Décisions : les devises ne sont jamais converties ; coût/prix absent reste null. Le taux présenté sera la part des pièces actuellement hors corbeille ayant un port confirmé sur la période (définition affichée), pas un taux historique de présence.
Décisions : rappels in-app désactivés par défaut ; activation explicite en UI. Aucun push ni demande de permission navigateur. Les préférences push, quiet hours, événements/valises et import/export complet restent ouverts.

Revue indépendante : blocage des comptes suivants sur échec worker corrigé RED→GREEN. Contrôle complémentaire instant exact horloge corrigé RED→GREEN. Résultats : 409 unités, 284 intégrations sur base préparée, build web/worker et contrôles statiques PASS. Détails/limites : docs/foundation/2026-10-29-activity-report.md.
