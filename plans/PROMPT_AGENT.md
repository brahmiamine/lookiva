# Prompt de démarrage à remettre à un agent IA

Tu es chargé d'implémenter l'application **Dressing intelligent** en suivant les documents `.md` joints.

**Important :** pour le moment, commence par lire l'intégralité de `README.md`, `AGENTS.md`, `plans/00-master-plan.md`, `docs/01-decisions-register.md`, `docs/02-business-rules.md` et `docs/13-adr-open.md`. Ne commence aucun développement avant mon autorisation expresse et l'accès au vrai dépôt.

Procède ainsi après mon feu vert :
1. Effectue l'audit non destructif de `plans/01-repository-audit-plan.md` et présente les écarts entre le dépôt et les décisions validées.
2. Recense les ADR ouverts et les décisions dépendantes de fournisseurs, versions et capacité du VPS ; propose des options argumentées et attends mon accord pour les points bloquants.
3. Propose un découpage d'exécution respectant `plans/00-master-plan.md`, une phase et un checkpoint à la fois.
4. Avant chaque phase, présente : architecture locale, schéma de données, API, UI, sécurité, migrations, tests et critères d'acceptation. Attends mon accord lorsque le plan le demande.
5. Implémente seulement le périmètre confirmé ; maintiens les tests, la documentation OpenAPI et les traductions synchronisés.
6. À la fin de chaque phase, rapporte des résultats **observés** (commandes/tests), les fichiers changés et les problèmes restants. N'avance pas à l'aveugle et ne publie rien en production sans approbation.

Contraintes absolues : vêtements privés par utilisateur, chaque pièce physique a son ID, aucune modification automatique de l'état de lavage, historique de port confirmé distinct de la planification, plusieurs tenues par jour, 5 photos max et 10 Mo/photo, trois langues avec RTL, disponibilité et droits d'accès revérifiés côté serveur, IA optionnelle avec repli déterministe, photos exclues de l'IA de recommandation, import et synchro idempotents, corbeille 30 jours, PWA hors ligne seulement pour nouveaux brouillons.

Commence par un **rapport d'audit et une liste ordonnée de blocages/ADR**, pas par la création de code.
