# 03 — Comptes, sessions, profil et internationalisation

**Statut : PLAN À EXÉCUTER UNIQUEMENT APRÈS AUTORISATION.**  
**Prérequis :** CP-02 approuvé.  
**Validation de sortie :** CP-03.  
**Référence :** `../AGENTS.md`, `../docs/01-decisions-register.md`, `../docs/02-business-rules.md`, `../docs/09-acceptance-criteria.md`.

## Objectif et périmètre
Livrer authentification email/password vérifiée, récupération, sessions individuellement révocables, profil/onboarding minimal et infrastructure des trois langues RTL. Protéger les premières API privées avant toute donnée réelle.

## Décisions non négociables
Email/mot de passe seulement ; email vérifié pour activation ; onboarding langue + ville seulement ; GPS facultatif ; pas de genre ; toutes données privées ; langue fr/en/ar et format chiffres/dates ; sessions listées et révocables ; photos jamais vers IA.

## Préparation — à produire AVANT toute modification
- [ ] Auditer le dépôt et comparer conventions, base, versions, migrations, endpoints et tests existants avec le périmètre de cette phase.
- [ ] Lire les ADR concernés dans `../docs/13-adr-open.md` ; les signaler comme **NON APPROUVÉS** et obtenir validation des choix bloquants.
- [ ] Présenter les changements envisagés, les interfaces touchées, les risques, les migrations et les commandes de vérification. Demander feu vert pour action destructive ou dépenses.

## Plan d'exécution détaillé
- [ ] **T01.** Implémenter modèles User, Credential, EmailToken, SessionRegistry et UserPreferences avec migrations et contraintes anti-duplication.
- [ ] **T02.** Implémenter inscription email/mot de passe avec mot de passe haché selon norme retenue, limitation rate, réponse anti-énumération, vérification email one-time et cooldown renvoi.
- [ ] **T03.** Configurer Auth.js Credentials selon version compatible ; intégrer contrôle de session côté serveur et registre révocable par utilisateur et appareil.
- [ ] **T04.** Implémenter login, logout session, logout toutes sessions, sessions list/revoke, gestion session expirée et connexion après vérification.
- [ ] **T05.** Créer reset mot de passe token haché/TTL/usage unique ; invalider sessions pertinentes, rate limit et audit sans révéler email.
- [ ] **T06.** Intégrer fournisseur transactionnel derrière adapter ; dev fake/local outbox, production provider uniquement après approbation coût/données.
- [ ] **T07.** Créer onboarding langue/ville, géocodage/saisie manuelle avec refus GPS sans blocage, timezone locale configurable.
- [ ] **T08.** Intégrer préférences IA et apprentissage indépendantes, sensibilité thermique, formats dates/chiffres et langue ; aucune autre préférence requise au départ.
- [ ] **T09.** Implémenter routing fr/en/ar, RTL pour ar, fallback traduction FR et composants bidi-safe ; ne jamais traduire texte utilisateur.
- [ ] **T10.** Définir désactivation des comptes, requête d’effacement et export en état préparatoire sans promettre purge des backup déjà en place.
- [ ] **T11.** Sécuriser owner scopes et conventions guard de toutes APIs à venir ; tests interuser, JWT révoqué, cookies/CSRF selon stack.
- [ ] **T12.** Concevoir UI mobile et accessible inscription/vérification/reset/sessions/paramètres avec chargement, erreurs, confirmations et RTL.

## Contrats API / intégrations
`/auth/register`, `/auth/email/verify`, `/auth/password/forgot`, `/auth/password/reset`, `/me`, `/me/sessions`, `/me/sessions/{id}`, `/me/preferences`, interfaces `EmailTransport`, `SessionRegistry`. Auth.js routes techniques séparées.

## Schéma de données et migration
User, Credential, EmailToken, SessionRegistry, UserPreferences, ConsentRecord. Transactions signup/token et révocation vérifiées ; ne pas exposer hashes.

## Vérifications obligatoires
- [ ] E2E inscription/vérification/connexion/récupération et token expiré/rejoué.
- [ ] Test que session révoquée est rejetée côté API même si cookie/JWT reste présent.
- [ ] Test 2 comptes et IDOR sur préférences.
- [ ] FR/EN/AR complet, RTL formulaires, adresses email bidi, keyboard/screen reader.
- [ ] Rate limiting, anti-énumération, secrets absents des logs.

## Critères d'acceptation du checkpoint CP-03
- [ ] Comptes vérifiés et sessions révocables démontrés.
- [ ] Onboarding 2 champs seulement, GPS facultatif.
- [ ] Tests multilingues et tenant isolation passés.

## Blocages / décisions à faire valider
- ADR-02 registre des sessions à approuver techniquement.
- Stratégie de hachage/password/TTL token et de session à faire approuver.
- Fournisseur email transactionnel et domaine/validation DNS non sélectionnés.

## Livrables attendus de l'agent
- Code et migrations uniquement si approuvés ; références des commits/PRs, sans push automatique ni déploiement production.
- Documentation mise à jour : schémas API OpenAPI, ERD, écrans, traductions, paramètres et opérations concernées.
- Rapport vérifiable `Critère -> commande/test -> résultat -> preuve`; tout test non exécuté = `NOT RUN`, jamais `PASS`.
- Liste des risques restants et demande explicite de validation **CP-03** avant phase suivante.

## Règles transversales
Toutes les données privées vérifiées côté serveur ; TypeScript strict ; transactions/idempotence sur actions critiques ; tests FR/EN/AR et RTL, mobile, erreurs et a11y pertinents ; aucun secret/PII dans les logs ; workflows sans suppression ni automatisation implicite.
