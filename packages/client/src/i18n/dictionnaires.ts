/* KÓMBE C14 — dictionnaires i18n FR/EN (story 12.6). FR est la langue de
   référence du pilote ; EN est posée ici comme architecture réelle (toutes les
   chaînes traversent `t`), pas comme traduction figée. Toute chaîne affichée
   passe par une clé : il n'existe aucun littéral de langue dans les composants.
   Vocabulaire local (« Njangi », « caisse ») conservé tel quel dans les deux
   langues (lien 3.8) — ce sont des noms de concepts, pas du texte à traduire. */

export const fr = {
  "app.titre": "KÓMBE",
  "app.sousTitre": "Registre de tontines fermées",
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
  "app.sousTitre": "Closed tontine registry",
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
