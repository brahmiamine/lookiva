# Rapport CP-03 — Phase 03 (comptes, sessions, profil, i18n)

| | |
|---|---|
| Phase | 03 — `plans/03-auth-profiles-i18n-plan.md` |
| Branche | `phase-03-identity` (locale, aucun push), base `phase-02-foundation` `5fac113`, HEAD `b964f93` |
| Dernier `pnpm verify` | **rapporté par l'implémenteur, non rejoué pour ce rapport** : à `b964f93`, depuis un état propre, `== verify: ALL STEPS PASSED (143s)`, `EXIT=0` ; unit 243 (41 fichiers), intégration 139 (13 fichiers), e2e 71 passés / 29 ignorés par conception (sous-ensembles de projets), scan de secrets OK. Journal hors dépôt : `scratchpad/verify2.log` (rapport `phase03-slice2b-report.md`) |
| Ce rapport | Rédigé en lecture seule : aucune commande de test, docker ou verify n'a été lancée par son auteur |
| Statut de validation | **CP-03 NON SIGNÉ.** Aucune validation du propriétaire n'est revendiquée ici. Voir la dernière section. |

Convention : `Critère → Commande/test → Résultat → Preuve`. « Réussi (rapporté) » = exécuté par l'implémenteur dans `pnpm verify` à `b964f93` ou dans une revue antérieure, non rejoué ici. Tout ce que personne n'a exécuté est `NOT RUN`.

## Critères d'acceptation CP-03

| Critère | Commande/test | Résultat | Preuve |
|---|---|---|---|
| Comptes vérifiés démontrés | `pnpm test:int` (`auth.int`, `fix-round1/2.int`) + e2e `journey_register_verify_onboard_profile_sessions` (5 projets) | Réussi (rapporté) | login 403 `EMAIL_NOT_VERIFIED` avant le lien ; parcours inscription → outbox → vérification → connexion ; jeton retiré de l'URL et absent de toute URL de requête |
| Sessions révocables démontrées | `auth.int` `revoked_session_is_401_even_with_its_valid_cookie` ; e2e `second_device_is_revoked_from_the_first_and_rejected_next_request`, `logout_and_logout_everywhere_with_confirmation_dialog`, `forgot_and_reset_password_signs_out_every_session` | Réussi (rapporté) | `/api/v1/me` 401 après révocation, cookie toujours présent |
| Onboarding 2 champs seulement, GPS facultatif | `me.int` (`POST /me/onboarding` : `locale` + `cityName` requis, `strictObject`) ; `geo.int` `accepts_a_manual_city_with_an_explicit_timezone_and_no_gps` ; e2e `onboarding_gps_denied_never_blocks_and_manual_city_works` (fr-mobile, ar-mobile) | Réussi (rapporté) ; GPS **accordé** : `NOT RUN` | refus GPS testé seulement |
| Tests multilingues passés | `tests/i18n/messages.test.ts` `message_keys_are_identical_across_fr_en_ar` ; e2e sur fr/en/ar desktop + fr/ar mobile ; `every_identity_page_passes_axe_reflows_and_has_lang_dir_and_title` | Réussi (rapporté) ; relecture native AR/EN : `NOT RUN` | `lang`/`dir`, titre localisé, axe 0 violation, reflow 375/320 px |
| Tenant isolation passée | `me.int` `IDOR between two accounts` ; `consents.int` `needs_a_session_and_is_strictly_per_user` ; `lifecycle.int` `records_a_pending_request_and_lists_only_the_callers_own` ; e2e `idor_sessions_and_preferences_are_scoped_to_their_owner` (fr-desktop) | Réussi (rapporté) | session d'autrui → 404 et reste vivante ; ETag d'autrui n'atteint que sa propre ligne |

## Vérifications obligatoires du plan 03

| Vérification | Commande/test | Résultat | Preuve |
|---|---|---|---|
| E2E inscription/vérification/connexion/récupération | e2e `journey_...`, `forgot_and_reset_password_signs_out_every_session` | Réussi (rapporté) | lien réutilisé → écran « lien invalide » |
| Jeton expiré/rejoué | `auth.int` `replayed_token_is_400_INVALID_TOKEN`, `expired_and_unknown_tokens_get_the_same_400_INVALID_TOKEN`, `reset_token_expires_after_one_hour` ; `fix-round1.int` `a_token_of_one_purpose_is_refused_by_the_other_and_is_not_burned` | Réussi (rapporté) | même 400 `INVALID_TOKEN` |
| Session révoquée rejetée côté API malgré le cookie | `auth.int` `revoked_session_is_401_even_with_its_valid_cookie`, `idle_session_expires_after_30_days_without_use`, `active_session_still_dies_at_the_90_day_absolute_limit` ; `fix-round1.int` `a_session_older_than_the_last_password_change_is_401` | Réussi (rapporté) | pas de JWT : sessions opaques, relues à chaque requête |
| 2 comptes et IDOR sur préférences | voir « Tenant isolation » | Réussi (rapporté) | — |
| FR/EN/AR complet, RTL formulaires | parité des clés + e2e 5 projets + axe | Réussi (rapporté) | — |
| Adresses e-mail bidi | revue tranche 2b (`<bdi dir="ltr">`, champs `dir=ltr`) | Revu, pas de test dédié | `phase03-slice2b-review.md` §3 |
| Clavier | e2e `keyboard_only_registration_and_login` (projets desktop) | Réussi (rapporté) | — |
| Lecteur d'écran | — | `NOT RUN` (aucun VoiceOver/TalkBack/NVDA) | — |
| Rate limiting | `auth.int` (login 10/15 min IP+e-mail, register 5/h IP, jetons 10/15 min, XFF falsifié), `fix-round1.int` (forgot 5/h, login 30/15 min IP), `fix-round2.int` (register 5/h par e-mail), e2e `rate_limited_login_shows_the_wait_and_blocks_the_button` | Réussi (rapporté) | 429 + `Retry-After` ; Redis absent → 503 |
| Anti-énumération | `auth.int` `register_answers_the_same...`, `forgot_answers_the_same...`, `resend_answers_the_same...`, `unknown_email_and_wrong_password_are_indistinguishable` | Réussi (rapporté, égalité fonctionnelle) ; mesure de temps : `NOT RUN` | — |
| Secrets absents des logs | `auth.int` bloc `cookies, secrets and wiring` (mot de passe, jetons, cookie absents des logs et corps) ; `geo.int` `never_logs_the_query` ; `pnpm secrets:scan` | Réussi (rapporté) | l'adresse e-mail n'est pas dans la liste vérifiée (mineur M-5) |

## Tâches T01–T12 (couverture)

| Tâche | État | Remarque |
|---|---|---|
| T01 modèles + migrations | Fait | 4 migrations relues à la main, rollback en en-tête, `utf8mb4_nopad_bin` ; `schema.int` (rapporté) |
| T02 inscription | Fait | scrypt, limites, anti-énumération, lien unique, cooldown 60 s |
| T03 Auth.js Credentials | **Écart** | Remplacé par des sessions opaques serveur (README : « pas de JWT ni d'Auth.js ») ; aucune décision du propriétaire trouvée → à confirmer |
| T04 login/logout/sessions | Fait | — |
| T05 reset | Fait | révoque toutes les sessions ; pas d'endpoint « changer de mot de passe » connecté |
| T06 transport e-mail | Partiel | `outbox` (dev/test) et `none` ; aucun fournisseur de production (identité en 503 en production) |
| T07 onboarding/géocodage | Fait (faux géocodeur, 26 villes) | fournisseur réel : phase 06 |
| T08 préférences | Fait | IA/apprentissage indépendants, sensibilité thermique, langue |
| T09 routing fr/en/ar, RTL | Fait (phase 02 + écrans) | — |
| T10 désactivation/effacement/export préparatoires | Fait (préparatoire) | rien n'est purgé ni exporté ; pas de réactivation |
| T11 guard + tests interuser | Fait | `withSession` exporté ; CSRF ; `OwnerId` |
| T12 UI | Fait | écarts aux maquettes : runbook §11 |

## Revue finale de la branche

`.superpowers/sdd/2026-10-28-phase-02-foundation/phase03-final-review.md` (hors dépôt, `.superpowers/` est ignoré). Verdict : **avec corrections**, 0 critique.

- **I-1 (à corriger avant signature)** : aucune réponse API authentifiée ni la réponse de login (`Set-Cookie`) ne porte `Cache-Control: no-store` (Next 16 n'en ajoute pas aux route handlers dynamiques). **Corrigé après cette revue** : `Cache-Control: no-store` est posé par `withApi` sur toute réponse `/api/v1` (test `every_api_answer_is_no_store...`).
- Mineurs : M-1 (login révoque la session présentée), M-2 (horodatage monotone aussi via PATCH), M-4 (logout 401 efface le cookie), M-5 (e-mail dans le test des journaux) et M-6 (runbook §9/§10) sont corrigés ; M-3 (`__Host-`) et M-7 restent ouverts (décision du propriétaire, runbook §10). Détail du fichier de revue (session précédente non révoquée au login, horodatage consentement via PATCH, préfixe `__Host-`, cookie non effacé sur logout 401, e-mail absent du test de logs, runbook §9 obsolète sur `AI` et sur l'I2 résiduel, ledger `progress.md` sans phase 03).

## Décisions prises en cours de phase (rulings des implémenteurs/revues)

1. Sessions opaques 256 bits, SHA-256 en base, relues à chaque requête ; pas d'Auth.js ni JWT.
2. Transactions identité en READ COMMITTED (interblocages P2034 en REPEATABLE READ) ; gardes `UPDATE ... WHERE`.
3. CSRF aussi sur les POST publics (contre le login CSRF) : `X-Requested-With: lookiva` + `Origin` = `APP_ORIGIN`.
4. `APP_ORIGIN` obligatoire ; liens mail seulement depuis `APP_ORIGIN` ; jeton dans le fragment `#token=`.
5. Mot de passe en attente sur le lien de vérification (anti-détournement avant vérification) ; résiduel I2 accepté.
6. Production : `TRUST_PROXY=true` ou acquittement explicite ; `READY_TOKEN` non placeholder ; `outbox` refusé.
7. `EMAIL_TRANSPORT=none` → 503 sur toutes les routes identité (fail fast).
8. Reset vérifie aussi l'e-mail ; ne fonctionne que pour un compte `ACTIVE`.
9. Annulation d'effacement publique (e-mail + mot de passe, limites du login).
10. Consentement `AI_RECOMMENDATIONS` (ancien `AI` ignoré) ; horodatage monotone sous verrou (0ac3cf6).
11. Corps JSON plafonné à 16 Kio ; IPv6 regroupé par /64 ; limiteur fermé (503) si Redis tombe.
12. UI : garde serveur au niveau du layout `(app)` + par page ; 404 sur révocation = déjà révoquée (b964f93).
13. En-têtes de sécurité (H1) reportés à la phase 12 ; export sans mot de passe voulu.

## Mineurs reportés (registre runbook §10 et revues)

I2 résiduel ; N4 `purgeEmailTokens` non planifié ; N6 ; N7 (NTP) ; M1, M2, M5, M8, M11, M12 (revue sécurité tranche 1) ; forgot/resend lisent le corps avant la limite ; DISABLED sans réactivation ni effacement ; DELETION_REQUESTED sans mot de passe ne peut pas annuler ; épuisement `reauth:user` par une session volée ; `q` dans les logs d'un futur proxy ; aucune alerte e-mail sur désactivation/effacement ; langue d'URL conservée après connexion ; `global-error.tsx` embarque 3 catalogues ; nits a11y (bascule mot de passe, jauge bavarde, alertes multiples) ; commit `faa36c1` contenant les maquettes du propriétaire ; mineurs M-1 à M-7 de la revue finale.

## NOT RUN

- Rejeu de `pnpm verify` pour ce rapport (cité tel que rapporté).
- `pnpm stack:up` avec l'environnement identité ; reverse proxy réel (`TRUST_PROXY=true` en unit/e2e seulement).
- Lecteurs d'écran, appareils réels ; relecture native arabe/anglais.
- Envoi d'e-mails réels ; GPS accordé ; mesure de temps de l'anti-énumération.
- Capture d'écran du profil après le restyle des interrupteurs.
- Scan de secrets de l'historique git complet.

## À confirmer par le propriétaire

- [ ] Durée de session : 30 jours d'inactivité (glissant), 90 jours absolus (`domain/policy.ts`).
- [ ] Paramètres scrypt : N=2^15, r=8, p=1, sel 16 octets, clé 64 octets.
- [ ] Politique de mot de passe : 12 à 128 points de code, sans règle de composition, liste de 117 mots de passe courants, différent de la partie locale de l'e-mail.
- [ ] Acceptation des conditions à l'inscription : aujourd'hui vérifiée côté client seulement, rien n'est enregistré, aucun document n'existe. Enregistrer (version, date) ou non.
- [ ] Approbation des maquettes d'authentification et de profil (`docs/design/mockups/auth-*`, `onboarding.html`, `parametres-*`) et des écarts listés au runbook §11.
- [ ] Report des en-têtes de sécurité (`Referrer-Policy`, `frame-ancestors`) à la phase 12.
- [ ] Remplacement d'Auth.js (plan T03) par des sessions opaques serveur ; approbation technique ADR-02.
- [ ] Fournisseur e-mail transactionnel et domaine/DNS (aucun choisi ; production en 503).
- [ ] Limite résiduelle I2 (réinscription avant clic) acceptée ou conception plus forte exigée.
- [x] Correction I-1 (`Cache-Control: no-store`) : implémentée et testée ; reste à vérifier par le propriétaire avec le reste de CP-03 (aucune validation propriétaire revendiquée).

**Demande explicite : validation CP-03 par le propriétaire avant la phase 04.**
