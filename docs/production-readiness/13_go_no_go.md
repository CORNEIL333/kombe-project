# 13 — Verdict GO / NO-GO (04/11/2026)

## Verdict : **GO conditionnel** pour un pilote (palier P1, ≤ 5 000 membres)

Le code de la branche `claude/continue-previous-a102rx` est prêt. La production l'est dès que le propriétaire a fait les **deux conditions bloquantes** ci-dessous (environ 10 minutes). Sans elles, le build refuse lui-même de déployer : c'est voulu.

### Conditions bloquantes : levées le 06/11/2026

1. `KOMBE_MFA_KEY` et `KOMBE_TOKEN_PEPPER` sont posés dans Vercel.
2. La branche est déployée (migrations 0036 à 0040). Contrôles passés : `/v1/health/ready` répond prêt avec le schéma à jour, SMOKE_PASS, rendu sans erreur.
3. L'API passe par le pooler en `kombe_api`.

**Reste au propriétaire :**
- **premier opérateur** : `grant-operator.mjs`, puis activer son second facteur (voir 11) ;
- **décision d'achat Neon**, si la rafale de 5 000 arrivées en une minute doit rester rapide (voir 12) ;
- **publication de l'application mobile** depuis le PC qui porte la clé de signature.

### Production 0.9.1 — 10/11/2026

- **En ligne :** déploiement `dpl_E7usZ2pak29Hh6FnLmAWXkNncJvr` (`master`, `0b7a965`), migrations jusqu'à 0043.
  - Contenu : CRM `/crm/`, faille V-18 fermée, jetons de session hachés (R-01), RLS vie privée (R-02), relève des envois (R-05), retours des membres.
- **Sauvegardes :**
  - `sauvegarde-avant-0-9-0-20261109` ;
  - `sauvegarde-avant-0-9-1-20261110`.
- **Retour arrière :**
  - `dpl_CgSFBHhi6tK8Caz3iFAxHEAWyEph` (0.9.0) ;
  - `dpl_Ep4zuchZidiPzsvZJwQqrZE2npJn` (0.8.1).
- **Contrôles :**
  - smoke test réussi (SMOKE_PASS) ;
  - 6 pages rendues sans erreur ;
  - 0 jeton en clair, 42 sessions actives conservées ;
  - RLS active ;
  - 29/29 preuves PostgreSQL avant déploiement.

### CRM de la plateforme (ADR-0046) — **déployé le 09/11/2026**

- Les consoles Opérations, Direction et Engineering sont réunies dans **`/crm/`** ; les anciennes adresses y redirigent.
- **Avant de déployer :** sauvegarde Neon, puis migration **0041_crm** (additive). Le build l'exige : `/v1/health/ready` attend `0041_crm`.
- **Preuves :**
  - `crm.proof.mjs` : 43/43 contrôles, en connexion directe et via PgBouncer ;
  - 40 pages analysées par axe (CRM et PWA, bureau et téléphone) sans violation ;
  - toutes les suites unitaires vertes.
- **À faire valider par un juriste :** la base légale du support (intérêt légitime) et la conservation de 730 jours.

### Critères remplis (avec preuves)

- **Sécurité P0** : 8 défauts corrigés et prouvés (02, 10).
- **Intégrité financière** :
  - idempotence atomique ;
  - double contrôle ;
  - journal immuable ;
  - KÓMBE ne valide jamais un paiement à la place d'une personne ;
  - modules sensibles fermés.
- **Tests** : 28/28 preuves PostgreSQL (dont celle du CRM), en direct et via PgBouncer et toutes les suites unitaires, exécutées en CI à chaque poussée.
- **Mise à niveau** répétée sur une copie de la production.
- **Restauration** démontrée en moins d'une minute (06).
- **Matrice adverse** : 12/12 PASS (10).
- **Performance mesurée** : 365 req/s sur une instance, p95 de 126 ms, 0 erreur (09).
- **Accessibilité** : 24/24 analyses sans violation automatique (08).
- **Dépendances** : 0 vulnérabilité connue ; aucun secret dans l'historique.

### Ce qui ferait passer en NO-GO

- Déployer en contournant la garde (`KOMBE_SKIP_MIGRATIONS=1`) sans avoir migré.
- Ouvrir l'envoi externe (`KOMBE_NOTIFY_EXTERNAL=on`) avec SMS sans budget validé.
- Dépasser le palier P1 sans avoir basculé l'API vers le pooler (R-03 : code livré, bascule à faire, voir 11).

### Risques résiduels acceptés pour le pilote (plan dans 02 et 12)

| Risque | Plan |
|---|---|
| R-01 : jetons de session en clair | Corrigé en production (0042, empreinte SHA-256) |
| R-02 : tables « vie privée » sans RLS | Corrigé en production (0042) ; reste `"group"`, sans donnée personnelle |
| R-03 : connexions directes | Code livré et prouvé (ADR-0045) ; bascule propriétaire |
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
