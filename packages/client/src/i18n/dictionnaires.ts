/* KÓMBE C14 — dictionnaires i18n FR/EN (story 12.6). FR est la langue de
   référence du pilote ; EN est posée ici comme architecture réelle (toutes les
   chaînes traversent `t`), pas comme traduction figée. Toute chaîne affichée
   passe par une clé : il n'existe aucun littéral de langue dans les composants.
   Vocabulaire local (« Njangi », « caisse ») conservé tel quel dans les deux
   langues (lien 3.8) — ce sont des noms de concepts, pas du texte à traduire. */

export const fr = {
  "app.titre": "KÓMBE",
  "app.sousTitre": "Votre tontine, plus claire.",
  "lien.evitement": "Aller au contenu principal",
  "langue.libelle": "Langue",
  "langue.fr": "Français",
  "langue.en": "English",
  "langue.bascule": "Changer la langue de l'interface",

  "parcours.titre": "Créer mon groupe",
  "parcours.consigne":
    "Quatre étapes, vous pouvez revenir en arrière sans perdre vos données.",
  "parcours.etapeSur": "Étape {etape} sur {total}",
  "parcours.etapeEncours": "en cours",
  "parcours.etapeTerminee": "terminée",

  "etape.modele": "Modèle",
  "etape.njangi": "Njangi",
  "etape.caisse": "Caisse",
  "etape.recap": "Récapitulatif",

  "champ.nomGroupe": "Nom du groupe",
  "aide.nomGroupe": "Exemple : Tontine des voisins.",
  "erreur.nomGroupe": "Erreur : le nom du groupe est obligatoire.",

  "champ.modele": "Modèle de tontine",
  "modele.rotation": "Rotation égale — chacun reçoit à son tour",
  "modele.caisse": "Caisse commune — cotisations versées dans une caisse",

  "champ.montant": "Montant de la cotisation (XAF)",
  "aide.montant": "Entier en francs CFA, sans virgule ni décimale.",
  "erreur.montant": "Erreur : saisissez un montant entier positif.",

  "champ.membres": "Nombre de membres",
  "aide.membres": "De 3 à 1000 membres.",
  "erreur.membres": "Erreur : entrez un nombre de membres entre 3 et 1000.",

  "bouton.precedent": "Précédent",
  "bouton.suivant": "Suivant",
  "bouton.confirmer": "Confirmer le groupe",

  "recap.titre": "Récapitulatif avant validation définitive",
  "recap.consigne":
    "Relisez attentivement. Rien n'est enregistré tant que vous ne confirmez pas.",
  "recap.nomGroupe": "Nom du groupe",
  "recap.modele": "Modèle",
  "recap.montant": "Cotisation",
  "recap.membres": "Membres",
  "recap.cycle": "Un cycle complet",
  "recap.montantValeur": "{montant} XAF",
  "recap.cycleValeur": "{membres} tours (1 par membre)",

  "obligation.titre": "Aperçu d'une contribution",
  "obligation.consigne":
    "Ce que vous déclarez est distingué de ce qui est validé par le serveur.",
  "statut.enCours": "Déclaré — en cours de validation",
  "statut.valide": "Validé",
  "statut.conteste": "Contesté",

  "etat.chargement": "Chargement en cours…",
  "etat.vide": "Aucune donnée à afficher pour le moment.",
  "etat.erreur": "Erreur : l'opération a échoué. Réessayez.",
  "etat.permission":
    "Vous n'avez pas les droits nécessaires pour voir cette section.",
  "etat.horsLigne":
    "Hors ligne : vos saisies sont conservées, la synchronisation reprendra.",
  "horsLigne.badge": "Hors ligne",
  "horsLigne.derniereSync": "Dernière synchronisation : {date}",
  "horsLigne.brouillonsEnAttente":
    "{nombre} brouillon(s) en attente — non validés par le serveur",
  "horsLigne.jamaisValide":
    "Brouillon local — jamais considéré validé tant que vous êtes hors ligne",

  "nav.creerGroupe": "Créer un groupe",
  "nav.cotisation": "Ma cotisation",

  "nav.tontines": "Mes tontines",
  "amorce.titre": "Créer, rejoindre ou découvrir une tontine",
  "amorce.consigne":
    "Ces actions parlent au serveur réel. Les décisions (devise, fuseau, identités, typologie) restent serveur.",
  "amorce.creer": "Créer une tontine",
  "amorce.rejoindre": "Rejoindre avec un code",
  "amorce.decouvrir": "Découvrir des tontines",
  "amorce.parrainage": "Demander un parrainage",
  "amorce.sessionRequise":
    "Ouvrez une session réelle pour créer une tontine, rejoindre ou être parrainé.",
  "amorce.chargerListe": "Charger la liste publique",
  "amorce.creee": "Tontine créée sur le serveur.",
  "amorce.rejointe": "Demande d'adhésion transmise (en attente de validation).",
  "amorce.parrainDemande": "Demande de parrainage transmise au serveur.",
  "amorce.listeVide": "Aucune tontine publique à découvrir pour le moment.",
  "amorce.typologieP1":
    "Typologie reconnue mais non démarrable au pilote (recette dédiée à venir).",
  "amorce.mesTontines": "Mes adhésions",
  "amorce.chargerMesTontines": "Voir mes tontines",
  "amorce.mesTontinesVide":
    "Vous n'êtes membre d'aucune tontine pour le moment.",
  "amorce.superviseePar": "supervisée par {id}",
  "adhesion.active": "membre actif",
  "adhesion.pending": "adhésion en attente",
  "adhesion.revoked": "révoqué",
  "adhesion.departed": "parti",
  "champ.modeleTontine": "Modèle de tontine",
  "champ.typologie": "Typologie de rotation",
  "champ.parentGroupe": "Groupe parent de supervision (facultatif)",
  "aide.parentGroupe":
    "Une association faîtière supervise des tontines ; la supervision n'a aucun droit financier.",
  "champ.codeInvitation": "Code d'invitation reçu",
  "champ.identifiantParrain": "Identifiant du parrain (membre actif)",
  "bouton.creerTontine": "Créer la tontine",
  "bouton.rejoindre": "Rejoindre",
  "bouton.demanderParrainage": "Demander le parrainage",
  "modele.famille": "Famille",
  "modele.collegues": "Collègues",
  "modele.fetes": "Fêtes",
  "modele.construction": "Construction",
  "modele.etudiant": "Étudiant",
  "modele.personnalise": "Personnalisé",
  "typologie.rotativeFermee": "Rotation fermée (égale)",
  "typologie.tirage": "Tirage au sort",
  "typologie.negocie": "Négocié",

  "connexion.titre": "Connexion",
  "connexion.consigne":
    "Un code à 6 chiffres vous est envoyé par email — aucun mot de passe.",
  "champ.email": "Adresse email",
  "aide.email": "L'identifiant que vous avez utilisé à l'inscription.",
  "erreur.email": "Erreur : saisissez votre adresse email.",
  "bouton.envoyerCode": "Envoyer le code",
  "connexion.codeEnvoye": "Code envoyé — vérifiez votre boîte de réception.",
  "champ.code": "Code reçu par email",
  "aide.code": "6 chiffres.",
  "erreur.code": "Erreur : saisissez le code à 6 chiffres reçu par email.",
  "bouton.confirmerCode": "Confirmer et se connecter",
  "bouton.changerEmail": "Changer d'adresse email",
  "connexion.connecte": "Connecté — session réelle ouverte.",
  "bouton.deconnexion": "Se déconnecter",
  "connexion.headlinePlain": "Votre tontine,",
  "connexion.headlineAccent": "plus claire.",
  "connexion.headlineSuite": "",
  "connexion.sousAccroche": "Les tours, les cotisations et les décisions du groupe, visibles par chaque membre.",
  "connexion.signature": "Votre tontine reste votre tontine. KÓMBE la rend plus claire.",
  "connexion.bonRetour": "Bon retour !",
  "connexion.ongletConnexion": "Se connecter",
  "connexion.ongletInscription": "Créer un compte",
  "connexion.titreInscription": "Créer votre compte",
  "connexion.consigneInscription":
    "Un code à 6 chiffres valide votre adresse email — aucun mot de passe.",
  "connexion.codeInscriptionEnvoye":
    "Code d'inscription envoyé — vérifiez votre boîte de réception.",
  "bouton.creerCompte": "Créer mon compte",
  "bouton.verifierCompte": "Vérifier et activer mon compte",
  "connexion.compteVerifie":
    "Compte vérifié — saisisez le code de connexion qui vient de vous être envoyé.",
  "marque.tagline": "Votre tontine, plus claire.",
  "atout.securise.titre": "Traçable",
  "atout.securise.texte": "Chaque cotisation est datée et validée par le groupe",
  "atout.solidaire.titre": "Solidaire",
  "atout.solidaire.texte": "Les règles sont votées, l'ordre des tours est visible",
  "atout.simple.titre": "Simple",
  "atout.simple.texte": "Un téléphone suffit, même avec un réseau faible",
  "atout.durable.titre": "Honnête",
  "atout.durable.texte": "KÓMBE ne détient jamais l'argent du groupe",

  "cotisation.titre": "Déclarer une cotisation",
  "cotisation.consigne":
    "Ce que vous déclarez est distingué de ce qui est validé par le serveur.",
  "champ.groupe": "Identifiant du groupe",
  "champ.obligation": "Identifiant de l'obligation",
  "bouton.charger": "Charger l'obligation",
  "obligation.du": "Montant dû",
  "obligation.restant": "Restant dû (validé net)",
  "obligation.disponible": "Disponible à déclarer",
  "obligation.nombreDeclarations": "Cotisations déclarées",
  "champ.montantCotisation": "Montant à déclarer (XAF)",
  "champ.canal": "Canal",
  "canal.cash": "Espèces",
  "canal.electronic": "Électronique",
  "champ.dateAlleguee": "Date de la cotisation",
  "bouton.declarer": "Déclarer la cotisation",
  "cotisation.declaree": "Cotisation déclarée et scellée au journal.",
  "cotisation.rejouee": "Déjà déclarée à l'identique — aucune nouvelle écriture (rejeu).",
} as const;

export type CleI18n = keyof typeof fr;
export type Langue = "fr" | "en";

// EN couvre exactement les mêmes clés (le type force la complétude : aucune
// chaîne FR ne peut rester sans équivalent EN à la compilation).
export const en: Record<CleI18n, string> = {
  "app.titre": "KÓMBE",
  "app.sousTitre": "Your tontine, made clear.",
  "lien.evitement": "Skip to main content",
  "langue.libelle": "Language",
  "langue.fr": "Français",
  "langue.en": "English",
  "langue.bascule": "Change the interface language",

  "parcours.titre": "Create my group",
  "parcours.consigne":
    "Four steps. You can go back without losing the data you entered.",
  "parcours.etapeSur": "Step {etape} of {total}",
  "parcours.etapeEncours": "in progress",
  "parcours.etapeTerminee": "done",

  "etape.modele": "Model",
  "etape.njangi": "Njangi",
  "etape.caisse": "Cashbox",
  "etape.recap": "Summary",

  "champ.nomGroupe": "Group name",
  "aide.nomGroupe": "Example: Neighbours' tontine.",
  "erreur.nomGroupe": "Error: the group name is required.",

  "champ.modele": "Tontine model",
  "modele.rotation": "Equal rotation — everyone receives in turn",
  "modele.caisse": "Shared cashbox — contributions paid into a box",

  "champ.montant": "Contribution amount (XAF)",
  "aide.montant": "Whole number in CFA francs, no comma or decimals.",
  "erreur.montant": "Error: enter a positive whole-number amount.",

  "champ.membres": "Number of members",
  "aide.membres": "Between 3 and 1000 members.",
  "erreur.membres": "Error: enter a number of members between 3 and 1000.",

  "bouton.precedent": "Back",
  "bouton.suivant": "Next",
  "bouton.confirmer": "Confirm the group",

  "recap.titre": "Summary before final confirmation",
  "recap.consigne":
    "Review carefully. Nothing is saved until you confirm.",
  "recap.nomGroupe": "Group name",
  "recap.modele": "Model",
  "recap.montant": "Contribution",
  "recap.membres": "Members",
  "recap.cycle": "One full cycle",
  "recap.montantValeur": "{montant} XAF",
  "recap.cycleValeur": "{membres} turns (1 per member)",

  "obligation.titre": "Contribution preview",
  "obligation.consigne":
    "What you declare is kept apart from what the server validates.",
  "statut.enCours": "Declared — awaiting validation",
  "statut.valide": "Validated",
  "statut.conteste": "Disputed",

  "etat.chargement": "Loading…",
  "etat.vide": "No data to display yet.",
  "etat.erreur": "Error: the operation failed. Please try again.",
  "etat.permission": "You don't have the rights to view this section.",
  "etat.horsLigne":
    "Offline: your entries are kept, syncing will resume.",
  "horsLigne.badge": "Offline",
  "horsLigne.derniereSync": "Last sync: {date}",
  "horsLigne.brouillonsEnAttente":
    "{nombre} draft(s) pending — not validated by the server",
  "horsLigne.jamaisValide":
    "Local draft — never treated as validated while you are offline",

  "nav.creerGroupe": "Create a group",
  "nav.cotisation": "My contribution",

  "nav.tontines": "My tontines",
  "amorce.titre": "Create, join or discover a tontine",
  "amorce.consigne":
    "These actions talk to the real server. Decisions (currency, timezone, identities, rotation type) stay server-side.",
  "amorce.creer": "Create a tontine",
  "amorce.rejoindre": "Join with a code",
  "amorce.decouvrir": "Discover tontines",
  "amorce.parrainage": "Request a sponsorship",
  "amorce.sessionRequise":
    "Open a real session to create a tontine, join, or be sponsored.",
  "amorce.chargerListe": "Load the public list",
  "amorce.creee": "Tontine created on the server.",
  "amorce.rejointe": "Join request submitted (awaiting validation).",
  "amorce.parrainDemande": "Sponsorship request submitted to the server.",
  "amorce.listeVide": "No public tontine to discover right now.",
  "amorce.typologieP1":
    "Rotation type recognized but not startable on the pilot (dedicated recipe to come).",
  "amorce.mesTontines": "My memberships",
  "amorce.chargerMesTontines": "View my tontines",
  "amorce.mesTontinesVide":
    "You are not a member of any tontine yet.",
  "amorce.superviseePar": "supervised by {id}",
  "adhesion.active": "active member",
  "adhesion.pending": "membership pending",
  "adhesion.revoked": "revoked",
  "adhesion.departed": "departed",
  "champ.modeleTontine": "Tontine model",
  "champ.typologie": "Rotation type",
  "champ.parentGroupe": "Supervising parent group (optional)",
  "aide.parentGroupe":
    "An umbrella association supervises tontines; supervision carries no financial rights.",
  "champ.codeInvitation": "Invitation code received",
  "champ.identifiantParrain": "Sponsor identifier (active member)",
  "bouton.creerTontine": "Create the tontine",
  "bouton.rejoindre": "Join",
  "bouton.demanderParrainage": "Request the sponsorship",
  "modele.famille": "Family",
  "modele.collegues": "Colleagues",
  "modele.fetes": "Parties",
  "modele.construction": "Construction",
  "modele.etudiant": "Student",
  "modele.personnalise": "Custom",
  "typologie.rotativeFermee": "Closed (equal) rotation",
  "typologie.tirage": "Random draw",
  "typologie.negocie": "Negotiated",

  "connexion.titre": "Sign in",
  "connexion.consigne":
    "A 6-digit code is emailed to you — no password.",
  "champ.email": "Email address",
  "aide.email": "The identifier you used at registration.",
  "erreur.email": "Error: enter your email address.",
  "bouton.envoyerCode": "Send the code",
  "connexion.codeEnvoye": "Code sent — check your inbox.",
  "champ.code": "Code received by email",
  "aide.code": "6 digits.",
  "erreur.code": "Error: enter the 6-digit code received by email.",
  "bouton.confirmerCode": "Confirm and sign in",
  "bouton.changerEmail": "Change email address",
  "connexion.connecte": "Signed in — real session open.",
  "bouton.deconnexion": "Sign out",
  "connexion.headlinePlain": "Your tontine,",
  "connexion.headlineAccent": "made clear.",
  "connexion.headlineSuite": "",
  "connexion.sousAccroche": "Rounds, contributions and group decisions, visible to every member.",
  "connexion.signature": "Your tontine stays yours. KÓMBE makes it clear.",
  "connexion.bonRetour": "Welcome back!",
  "connexion.ongletConnexion": "Sign in",
  "connexion.ongletInscription": "Create an account",
  "connexion.titreInscription": "Create your account",
  "connexion.consigneInscription":
    "A 6-digit code verifies your email address — no password.",
  "connexion.codeInscriptionEnvoye":
    "Sign-up code sent — check your inbox.",
  "bouton.creerCompte": "Create my account",
  "bouton.verifierCompte": "Verify and activate my account",
  "connexion.compteVerifie":
    "Account verified — enter the sign-in code that was just sent to you.",
  "marque.tagline": "Your tontine, made clear.",
  "atout.securise.titre": "Traceable",
  "atout.securise.texte": "Every contribution is dated and validated by the group",
  "atout.solidaire.titre": "Collective",
  "atout.solidaire.texte": "Rules are voted, the order of rounds is visible",
  "atout.simple.titre": "Simple",
  "atout.simple.texte": "A phone is enough, even on a weak network",
  "atout.durable.titre": "Honest",
  "atout.durable.texte": "KÓMBE never holds the group's money",

  "cotisation.titre": "Declare a contribution",
  "cotisation.consigne":
    "What you declare is kept apart from what the server validates.",
  "champ.groupe": "Group identifier",
  "champ.obligation": "Obligation identifier",
  "bouton.charger": "Load the obligation",
  "obligation.du": "Amount due",
  "obligation.restant": "Remaining due (net validated)",
  "obligation.disponible": "Available to declare",
  "obligation.nombreDeclarations": "Declared contributions",
  "champ.montantCotisation": "Amount to declare (XAF)",
  "champ.canal": "Channel",
  "canal.cash": "Cash",
  "canal.electronic": "Electronic",
  "champ.dateAlleguee": "Contribution date",
  "bouton.declarer": "Declare the contribution",
  "cotisation.declaree": "Contribution declared and sealed to the journal.",
  "cotisation.rejouee": "Already declared identically — no new write (replay).",
};

export const dictionnaires: Record<Langue, Record<CleI18n, string>> = { fr, en };

/** Interpolation minimaliste : remplace `{nom}` par la valeur fournie. */
export function interpoler(
  modele: string,
  variables: Readonly<Record<string, string | number>> = {},
): string {
  return modele.replace(/\{(\w+)\}/g, (whole, nom: string) =>
    Object.prototype.hasOwnProperty.call(variables, nom)
      ? String(variables[nom])
      : whole,
  );
}
