# ADR-0038 — Décisions votées de l'assemblée, reprise de place et part partagée

- **Statut :** **PROPOSÉ, appliqué par défaut** (seuils à confirmer par le porteur) — lots L-03, L-09, L-10, L-11, L-14.
- **Date :** 2026-10-13
- **Auteur :** harnais `claude-code` (prompt maître « KÓMBE, tontine réelle »)

## Contexte

Dans une tontine ou une association camerounaise, plusieurs décisions lourdes
ne relèvent ni du trésorier ni du président seuls : décaler les séances
(fêtes, deuil, rentrée scolaire), retirer une fonction à un membre du bureau,
exclure un membre, lui retirer le droit de « bouffer » tant qu'il n'a pas
régularisé, ou faire reprendre sa place par quelqu'un d'autre. Le domaine
contenait ces règles (`removalAdopted`, `suggestedSanction`, `meetingDates`
avec pauses, `catchUpPlan`) sans aucune route ni écran : le mobile répondait
« aucun vote » (I-09), les dates restaient figées, un membre défaillant
bloquait le cycle. Les membres qui n'ont les moyens que d'une demi-part
(« demi-main ») n'étaient pas non plus représentables à l'écran.

## Décision

1. **Un seul mécanisme de vote** (`group_decision`, `decision_ballot`, migration 0030) pour cinq
   décisions : `pause`, `removal` (destitution), `exclusion`,
   `payout_suspension`, `replacement` (reprise de place). L'ancien couple
   `vote`/`ballot` du socle C reste pour compatibilité, non utilisé par le produit.
2. **Majorité absolue des électeurs**, jamais des votants : adoptée si
   `oui × 2 > électeurs`. Électeurs = membres actifs ayant un téléphone,
   admis avant l'ouverture ; la personne visée ne vote pas sur son sort. Les
   membres sans téléphone ne sont pas comptés (leur représentant vote pour
   lui-même) — **à confirmer**.
3. **Délai de défense** : destitution et exclusion durent au moins 72 h et ne
   sont jamais adoptées avant l'échéance, sauf si tous les électeurs ont
   voté. Pause, suspension et reprise : 24 h minimum, adoptées dès que la
   majorité absolue est acquise. Un rejet certain est constaté aussitôt.
4. **Vote secret** : pendant le scrutin, seul le nombre de bulletins est
   visible ; le décompte est publié au dépouillement. Le journal chaîné
   enregistre le dépôt d'un bulletin, jamais le choix. Bulletin unique,
   définitif (trigger + absence de droit UPDATE/DELETE).
5. **Qui ouvre** : pause et reprise de place → bureau (calendrier, ordre) ;
   destitution → **tout membre** (contre-pouvoir) ; exclusion → présidence ;
   suspension → censeur ou présidence.
6. **Exécution serveur dans la transaction du bulletin décisif** :
   - pause : les tours non entamés glissent de N occurrences (1 à 6) sur la
     cadence réelle, séances comprises (`kombe.schedule_shift`) ;
   - destitution : la fonction prend fin ; le bureau nomme un remplaçant,
     qui doit accepter ;
   - exclusion : adhésion révoquée, fonctions terminées. S'il a déjà
     « bouffé », ce qu'il doit encore jusqu'à la fin du cycle devient une
     **dette de rattrapage** (son parrain inscrit comme avaliseur). Sinon sa
     place est **vacante** : la remise de son tour est refusée jusqu'à une
     reprise de place ; ce qu'il a versé lui revient selon les statuts
     (règlement hors application, KÓMBE ne garde pas l'argent) ;
   - suspension : toute remise au membre est refusée (`PAYOUT_SUSPENDED`)
     jusqu'à la levée motivée par la présidence ;
   - reprise de place : la part change de titulaire à partir du premier tour
     ouvert (`share_holder.from_seq/until_seq`) ; le repreneur devient
     bénéficiaire du tour ; le montant déjà versé par l'ancien titulaire est
     affiché pour le **rachat de place**, réglé entre eux devant le bureau.
7. **Graduation des sanctions** (`GET /sanctions`) : avertissement → amende
   → suspension → vote d'exclusion, suggérée d'après les retards et dettes
   ouverts. Le module suggère ; seuls le bureau et le vote décident.
8. **Part partagée** : avant le démarrage, le bureau associe deux membres
   sur UNE part ; chacun cotise la moitié (reste éventuel au premier), la
   remise du tour est déclarée au premier titulaire pour les deux.

## Conséquences

- La remise attendue d'un tour ne compte que les parts ayant un titulaire à
  ce tour (une place vacante n'est pas « due »).
- Correctif trouvé par la preuve : une remise complète n'exige plus de
  caisse d'avance quand personne ne manque (associations sans caisse de
  fonctionnement).
- Preuves : `packages/domain/test/decisions.test.ts`,
  `packages/api/test/decisions.proof.mjs` (PostgreSQL réel),
  `packages/db/tests/isolation.pg.mjs` scénario `C30_DECISION`.
- À confirmer par le porteur : seuils (majorité absolue partout), durées
  minimales (72 h / 24 h), exclusion des membres sans téléphone du corps
  électoral, sort des sommes versées par un exclu qui n'a pas bouffé.
