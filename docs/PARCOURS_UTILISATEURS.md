# Parcours utilisateurs — KÓMBE, tontine réelle

KÓMBE tient le registre de votre tontine et de votre association. Il ne garde
pas votre argent : chaque versement est fait **hors de l'application**
(espèces en séance, Orange Money, MTN MoMo, banque, transfert depuis
l'étranger), **déclaré** dans KÓMBE, **confirmé** par le trésorier, puis
**validé** par le commissaire aux comptes s'il y en a un. Le serveur ne
valide jamais rien à la place d'une personne.

Où : tout est à la même adresse — `/` (application des membres, PWA
installable sur Android), `/bureau/` (Espace bureau), `/ops/`, `/direction/`,
`/engineering/` (plateforme, opérateurs seulement). Application mobile
Flutter : mêmes données, mêmes règles.

Colonne **Preuve** : ce qui a été exécuté pour de vrai (navigateur Chromium
contre l'API et PostgreSQL, ou script contre PostgreSQL 16).

---

## 1. Se connecter (tout le monde)

| Étape | Écran | Règle | Preuve |
|---|---|---|---|
| Saisir son numéro (Orange, MTN, Camtel, Nexttel ; `6 77 12 34 56`) ou un e-mail | `/` Connexion | +237 normalisé ; voies proposées = voies réellement ouvertes (`/v1/auth/channels`) | E2E `tontine.spec.ts` |
| Recevoir le code à 6 chiffres (SMS, WhatsApp ou e-mail) | | code à durée courte, essais limités | `tontineApi.proof.mjs` AUTH-* |
| Donner son nom (celui que le groupe connaît) | | | E2E |
| Choisir sa langue : Français, English, Pidgin (bêta) | en-tête | gardée sur le téléphone | `droits.test.ts` (pidgin) |

## 2. Président·e — créer l'association et la lancer

| Étape | Écran | Règle | Preuve |
|---|---|---|---|
| « Créer une tontine » : nom, rythme (hebdo, quinzaine, mensuel, « 2e samedi », tous les N jours, quotidien), première séance, heure limite | Création, 7 étapes | heure de Douala | E2E |
| Cotisation par part, nombre de membres (2 à 60), cagnotte affichée | | montants entiers en FCFA | E2E |
| Ordre (tirage vérifiable, ordre d'arrivée, ordre décidé), témoins de remise, amendes, secours, fonctionnement, réserve de fin d'année, transparence | | | E2E |
| Inviter : code + lien + **partage WhatsApp** | Membres | code révocable, durée et usages bornés | E2E |
| Admettre les demandes | Membres | seule la présidence admet | E2E |
| Nommer trésorier, secrétaire, commissaire, censeur… | Membres | la personne nommée **accepte** ; jamais une fonction financière à soi-même | E2E, preuve ROLES |
| Ajouter un **membre sans smartphone**, représenté par un proche | Membres | | preuve |
| Régler les **parts** : 1 à 5 mains, ou **part partagée** (« demi-main ») | Membres | avant démarrage | `decisions.proof.mjs` SHARE-* |
| Publier les statuts ; chacun les accepte | Statuts | empreinte affichée ; impression / PDF | E2E |
| Démarrer le cycle (liste « À faire » sur l'Aperçu) | Aperçu | ordre figé ensuite (sauf échange ou tour prioritaire acceptés) | E2E |

## 3. Membre — payer, suivre, recevoir

| Étape | Écran | Règle | Preuve |
|---|---|---|---|
| Voir « Mes tontines » : prochaine séance, ce que je dois, ma date de remise | Accueil | | E2E |
| « Tout déclarer pour le tour n » (cagnotte + secours + fonctionnement) ou une déclaration simple | Aperçu / Cotisations | référence de transaction exigée pour Mobile Money, banque, transfert international | E2E, MOMO-NEEDS-REFERENCE |
| Payer **pour quelqu'un** (un parent, la diaspora) | Cotisations | « fait par … pour … » | preuve |
| **Diaspora** : « Transfert depuis l'étranger » (Western Union, WorldRemit, Wave…) — montant **reçu** en FCFA | Cotisations | référence obligatoire | ABROAD-* |
| Voir la grille « qui a payé » | Tours | selon la transparence choisie | preuve |
| Le jour de mon tour : « J'ai bien reçu » | Cotisations | le tour ne se clôt qu'après cet accusé | E2E |
| Notifications : rappels de séance, d'échéance, votes | Notifications | libellés sans montant ni nom (écran verrouillé) | preuves |
| Demander un **tour prioritaire** (deuil, maladie, frais de scolarité) | Tours | les personnes déplacées acceptent, le bureau non concerné approuve | PRIORITY-* |
| Demander un **échange de tour** | Tours | idem | SWAP-APPLIED |
| Demander un **secours** (naissance, décès, mariage, maladie) | Amendes & secours | barème et plafond annuel | preuve AID-* |
| **Voter** : pause, destitution, exclusion, suspension, reprise de place | Votes | vote secret, majorité absolue des électeurs | E2E `decisions.spec.ts` |
| Contester une amende | Amendes & secours | | preuve |

## 4. Trésorier·e — la séance et l'argent

| Étape | Écran | Règle | Preuve |
|---|---|---|---|
| Confirmer en lot les versements reçus | Cotisations / Espace bureau « Collecte » | jamais sa propre déclaration (la présidence confirme celle du trésorier) | E2E, TREASURER-NOT-OWN |
| Rejeter un versement non retrouvé (motif) | | | preuve |
| Déclarer la **remise** du tour, en séance ouverte, devant témoins présents | Séances / Tours | jamais par le bénéficiaire ; témoins notés présents | E2E, WITNESS-* |
| Tour incomplet : avance du fonds de caisse, remise réduite ou attente | Tours | l'impayé devient une **dette suivie** | DEBT-*, PAYOUT-REDUCED |
| Exporter les mouvements (CSV pour Excel) | Espace bureau | | navigateur |

## 5. Secrétaire — séance sans réseau, PV, historique

| Étape | Écran | Règle | Preuve |
|---|---|---|---|
| Ouvrir la séance, faire l'appel (présent, en retard, excusé, absent, représenté) | Séances | appel modifiable seulement séance ouverte | E2E |
| **Réseau coupé** : l'appel et les déclarations restent sur le téléphone, envoyés seuls au retour du réseau, **une seule fois** | bandeau orange | jamais présentés comme transmis | E2E `seanceHorsLigne.spec.ts` |
| Clore : **procès-verbal** généré (montants, présences, amendes), empreinte | Séances | | preuve MINUTES |
| Faire approuver le PV ; l'imprimer / l'enregistrer en PDF | Séances / Espace bureau | | navigateur |
| **Reprendre le cahier** (nom ; date ; montant) ou l'export de l'ancienne application | Registre | lignes à part, jamais dans un total ; réimport sans doublon | E2E, HISTORY-* |

## 6. Commissaire aux comptes et censeur

| Étape | Écran | Règle | Preuve |
|---|---|---|---|
| Valider après contrôle les versements confirmés | Cotisations | jamais les siens | AUDITOR-* |
| Vérifier le **registre** chaîné (aucun événement modifié ni supprimé) | Registre | | JOURNAL-VALID |
| Censeur : constater une amende (retard, absence, indiscipline) | Amendes & secours | barème accepté ; jamais à soi-même | preuve |
| Suivre la **graduation des sanctions** : avertissement → amende → suspension → vote d'exclusion | Votes / Espace bureau | suggestion seulement ; le vote tranche | SANCTIONS-* |

## 7. L'assemblée — décisions votées

| Décision | Qui l'ouvre | Effet si adoptée | Preuve |
|---|---|---|---|
| Pause des séances (1 à 6) | bureau | toutes les séances à venir glissent sur la cadence | PAUSE-*, E2E |
| Destitution d'un membre du bureau | **tout membre** | la fonction prend fin ; 72 h minimum | REMOVAL-* |
| Exclusion | présidence | adhésion révoquée ; s'il a bouffé : dette de rattrapage (parrain avaliseur) ; sinon place vacante | EXCLUSION-* |
| Suspension du droit de bouffer | censeur / présidence | aucune remise possible jusqu'à la levée | PAYOUT-SUSPENDED |
| Reprise de place | bureau | un membre reprend la part à partir du prochain tour ; rachat affiché | REPLACEMENT-* |

Majorité **absolue des électeurs** (pas des votants) ; la personne visée ne vote pas ; vote secret jusqu'au dépouillement ; bulletin unique et définitif.

## 8. Espace bureau (`/bureau/`)

Vue d'ensemble, collecte du tour, mouvements (CSV), membres & invitations,
séances & PV (impression), amendes / secours / dettes, **votes & sanctions**,
registre (CSV), règlement & statuts. Même compte que l'application.
Preuve : parcours piloté dans Chromium contre l'API réelle.

## 9. Plateforme (opérateurs KÓMBE seulement)

| Console | Contenu | Règle |
|---|---|---|
| `/ops/` | groupes, santé, file de support, runbooks | agrégats uniquement ; 403 à tout non-opérateur (`opsConsole.proof.mjs`) |
| `/direction/` | activité hebdomadaire, taux de confirmation | aucun montant individuel |
| `/engineering/` | version, schéma à jour (30 migrations), fournisseurs configurés | |
