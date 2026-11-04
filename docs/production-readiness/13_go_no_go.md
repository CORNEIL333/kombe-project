# 13 — Verdict GO / NO-GO (04/11/2026)

## Verdict : **GO conditionnel** pour un pilote (palier P1, ≤ 5 000 membres)

Le code de la branche `claude/continue-previous-a102rx` est prêt. La production l'est dès que le propriétaire a fait les **deux conditions bloquantes** ci-dessous (environ 10 minutes). Sans elles, le build refuse lui-même de déployer : c'est voulu.

### Conditions bloquantes (propriétaire)

1. Poser `KOMBE_MFA_KEY` et `KOMBE_TOKEN_PEPPER` dans Vercel Production (voir 11, étape 1).
2. Fusionner ou déployer la branche, vérifier `/v1/health/ready`, puis attribuer le premier opérateur et activer son second facteur (voir 11).

### Critères remplis (avec preuves)

- **Sécurité P0** : 8 défauts corrigés et prouvés (02, 10).
- **Intégrité financière** :
  - idempotence atomique ;
  - double contrôle ;
  - journal immuable ;
  - KÓMBE ne valide jamais un paiement à la place d'une personne ;
  - modules sensibles fermés.
- **Tests** : 27/27 preuves PostgreSQL et toutes les suites unitaires, exécutées en CI à chaque poussée.
- **Mise à niveau** répétée sur une copie de la production.
- **Restauration** démontrée en moins d'une minute (06).
- **Matrice adverse** : 12/12 PASS (10).
- **Performance mesurée** : 365 req/s sur une instance, p95 de 126 ms, 0 erreur (09).
- **Accessibilité** : 24/24 analyses sans violation automatique (08).
- **Dépendances** : 0 vulnérabilité connue ; aucun secret dans l'historique.

### Ce qui ferait passer en NO-GO

- Déployer en contournant la garde (`KOMBE_SKIP_MIGRATIONS=1`) sans avoir migré.
- Ouvrir l'envoi externe (`KOMBE_NOTIFY_EXTERNAL=on`) avec SMS sans budget validé.
- Dépasser le palier P1 sans traiter R-03 (connexions).

### Risques résiduels acceptés pour le pilote (plan dans 02 et 12)

| Risque | Plan |
|---|---|
| R-01 : jetons de session en clair | Empreinte prévue |
| R-02 : tables « vie privée » sans RLS | Exposées seulement en cas d'injection SQL |
| R-03 : connexions directes | — |
| R-04 : N+1 sur `/v1/me/tontines` | — |
| R-05 : tâche planifiée quotidienne | — |
| R-06 : TOTP plutôt que WebAuthn | — |
| R-07 : push à câbler dans l'application mobile | — |

## Conformité (Cameroun) — points à faire valider par un juriste

- **Données personnelles.** Le Cameroun s'est doté d'une loi de protection des données personnelles en 2024 (référence et décrets d'application à confirmer par un juriste). Ce qui est en place :
  - minimisation : numéro ou e-mail, nom d'affichage ;
  - registre des traitements (`processing_record`), consentements, export et effacement (tombstones) ;
  - hébergement en Union européenne (Francfort) : **transfert hors du Cameroun à déclarer ou encadrer**.
- **Paiements.** KÓMBE ne détient, ne reçoit ni ne transfère de fonds. C'est un registre déclaratif, et les mentions prudentes figurent dans les exports. Il faut faire confirmer que l'activité ne relève pas de la réglementation CEMAC des services de paiement ni de la microfinance (COBAC), surtout avant toute ouverture des modules fermés (prêts, enchères, tontinier : ADR-0032).
- **Notifications commerciales.** Aucune. Les messages hors de l'application sont transactionnels, consentis, désactivables, avec heures de silence.
