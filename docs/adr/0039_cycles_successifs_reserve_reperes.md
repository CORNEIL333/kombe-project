# ADR-0039 — Cycles successifs, réserve rendue, suppléance des fonctions et repères des membres

- **Statut :** **PROPOSÉ, appliqué par défaut** (règles à confirmer par le porteur).
- **Date :** 2026-10-13
- **Auteur :** harnais `claude-code`. Ce sont les fonctions de la PR #2 reprises sur master, dont la PR #3 était déjà fusionnée.

## Contexte

Le cycle complet de 3 à 5 tours a été rejoué sur PostgreSQL. Il a montré quatre manques sur master.

1. **Blocages par conflit d'intérêts.**
   - Quand le trésorier est seul en fonction et que vient son tour, personne ne peut déclarer sa remise. Le bénéficiaire ne déclare jamais sa propre remise, et la présidence n'avait pas le droit de le faire.
   - Quand le commissaire aux comptes est seul et reçoit sa remise, personne ne peut la contrôler. Il en va de même pour chacun de ses versements.
   - Ces mouvements restaient « confirmés » sans jamais être validés.
2. **Un seul cycle.** Au dernier tour, l'association passait « Terminée ». Or une tontine camerounaise recommence. Il fallait recréer l'association, et l'on perdait l'historique, les caisses et le registre.
3. **La réserve de fin d'année ne pouvait pas être rendue.**
4. **Ce que les membres demandent en séance n'était pas visible :**
   - « quand est-ce que je bouffe et qui avance à qui ? » ;
   - « qui paie à temps ? » ;
   - « envoie le résumé dans le groupe WhatsApp » ;
   - avant de créer le groupe : « on finit quand ? ».

## Décision

### 1. Suppléance

Elle n'intervient que si **tous** les titulaires d'une fonction sont la personne concernée. Sinon, rien ne change.

- **Remise d'un tour ou d'un secours :**
  - la trésorerie la déclare ;
  - si toute la trésorerie est le bénéficiaire, la présidence (président ou vice-président) la déclare ;
  - le bénéficiaire ne déclare jamais sa propre remise.
- **Contrôle :**
  - le commissaire contrôle ;
  - si tous les commissaires sont la personne concernée, le censeur ou la présidence contrôle à leur place ;
  - personne ne contrôle son propre mouvement ;
  - les trois actes (déclarer, confirmer, contrôler) restent faits par trois personnes distinctes, ce que la base impose elle-même.

### 2. Cycles successifs

Migration 0031, table `tontine_cycle`, route `POST /v1/tontines/:id/cycle-renewals`.

- **Quand :** une fois tous les tours clos, le bureau démarre le cycle suivant.
- **Membres et parts :** il prend les membres actifs avec leur nombre de parts. Ce nombre peut changer entre deux cycles, pas pendant.
- **Ordre :** tirage scellé, ordre d'arrivée ou ordre décidé, comme au premier cycle.
- **Numérotation :** les tours continuent leur numérotation (le cycle 2 commence au tour N+1).
- **Parts :** les parts du cycle précédent s'arrêtent à son dernier tour (`share_holder.until_seq`).
- **Statuts :** chaque membre ayant un téléphone doit avoir accepté la dernière version des statuts.
- **Ce qui ne change pas :** le règlement (montant, cadence) reste figé. Changer la cotisation changerait aussi les échéances passées : cela passe par une nouvelle association ou un vote.
- **Ce qui continue :** caisses, registre et dettes continuent.

### 3. Réserve de fin d'année

Route `POST /v1/tontines/:id/reserve-distributions`.

- **Montant :** chacun reprend ce qu'il a versé et qui ne lui a pas encore été rendu.
- **Réserve insuffisante :** si la réserve ne couvre pas tout, par exemple après une dépense votée, le partage se fait au prorata, au franc près (`planReserveDistribution`, domaine, 3 tests).
- **Une remise par membre et par exercice :** `related_kind = 'reserve'`, `related_id = année`, garanti par un index unique.
- **Circuit :** la remise est déclarée par la trésorerie, puis le membre accuse réception.
- **Remise d'un membre de la trésorerie :** elle est déclarée par un autre membre de la trésorerie ou par la présidence. Elle apparaît « à déclarer » dans la réponse.

### 4. Repères

Tous sont en lecture seule.

- **Simulateur** (`POST /v1/cycle-simulations`) : dates réelles de chaque séance, cagnotte, durée et engagement par part.
- **« Mon tour »** (`GET /v1/tontines/:id/my-forecast`) : pour chaque tour où je reçois, le montant, ce que j'aurai versé avant, et si le groupe m'avance de l'argent ou si c'est moi qui avance au groupe.
- **Régularité** (`GET /v1/tontines/:id/regularity`) :
  - contenu : tours échus versés à temps, en retard ou impayés après le délai de grâce, et amendes en cours ;
  - visibilité : le bureau voit tout le monde ; un membre voit selon la transparence du règlement (`bureau_only` : soi seulement ; `anonymized` : les autres sans nom).
- **Résumé WhatsApp** (`GET /v1/tontines/:id/meetings/:mid/share-text`) : présents, remise, prochaine séance et empreinte du procès-verbal. Aucun numéro de téléphone.

## Ce qui n'a pas été repris de la PR #2

- **Les rappels J-1/J-2 par tâche planifiée.** Master produit déjà ces rappels dans l'application, à la lecture des notifications : séance dans les 2 jours, échéance en grâce ou en retard. Les envoyer par SMS demande le compte SMS et une tâche planifiée Vercel Cron (voir `docs/BLOCAGES_TONTINE_REELLE.md`).
- **La clôture automatique d'un tour quand toutes ses remises sont validées.** Sur master, le bureau clôt le tour, ce qui ouvre les dettes des impayés. Ce geste reste humain.

## Preuves

- `packages/api/test/tontineCycles.proof.mjs` : 45 vérifications sur PostgreSQL 16 réel. Le parcours est un cycle complet à 3 avec trésorier et commissaire uniques, suivi de la réserve rendue, puis d'un cycle 2 de 4 tours avec deux parts pour une personne.
- `packages/client/e2e/cycles.spec.ts` (Playwright, API réelle) : « Mon tour », régularité, puis cycle 2 démarré depuis la PWA.
