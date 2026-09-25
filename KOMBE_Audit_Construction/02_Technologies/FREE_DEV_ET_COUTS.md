# Free for Developers et stratégie de coûts

## Recherche effectuée

Le répertoire [Free for Developers](https://free-for.dev/) renvoie à son [dépôt public](https://github.com/ripienaar/free-for-dev), consulté le 15 septembre 2026. Il répertorie des services avec offres gratuites, mais ne remplace pas les conditions du fournisseur. Les rubriques BaaS, hébergement, CI, identité, stockage et suivi d'erreurs ont servi à établir des pistes. Les conditions critiques ci-dessous ont été recoupées avec les sites officiels ; aucun avantage gratuit n'est supposé permanent.

| Service | Condition relevée chez le fournisseur | Usage conseillé pour KÓMBE | Décision avant réel |
|---|---|---|---|
| [Vercel Hobby](https://vercel.com/docs/plans/hobby) | Usage personnel non commercial | Démonstration personnelle seulement si admissible | Offre commerciale ou autre hébergeur ; plan réel inconnu |
| [Supabase Free](https://supabase.com/pricing) | 500 Mo DB, 1 Go objets ; pause après une semaine d'inactivité ; sauvegardes automatiques et PITR non inclus au Free | Développement fictif | Plan adapté + restauration + copie indépendante |
| [Neon Free](https://neon.com/docs/introduction/plans) | Offre gratuite avec allocations de calcul et stockage | Branche de développement ou comparaison PostgreSQL | Vérifier fenêtre de restauration, arrêt, limites et région dans contrat retenu |
| [Render Free](https://render.com/docs/free) | Base gratuite expirant après 30 jours ; services web gratuits limités | Essai éphémère sur données fictives | Compute/DB payants pour pilote durable |
| [Cloudflare Workers](https://developers.cloudflare.com/workers/platform/pricing/) | Offre gratuite et quotas ; dépassement et modèle CPU à examiner par produit | Assets et essai d'API compatible | Valider limites runtime/DB avant choix ; ne pas confondre Pages, Workers, D1 et R2 |
| [Resend](https://resend.com/pricing) | Offre Free avec limite quotidienne de 100 emails sur page consultée | Vérification sur petit jeu d'essai | Dimensionner récupération + invitations ; éviter de bloquer les comptes par quota |
| [Sentry](https://sentry.io/pricing/) | Plan gratuit disponible, capacités selon offre | Erreurs expurgées de développement | Comparer sièges, rétention, alertes et coût ; pas de session replay métier |
| [Backblaze B2](https://www.backblaze.com/cloud-storage/pricing) | Prix et conditions de stockage/traﬁc publiés | Copie indépendante chiffrée | Chiffrer volume, rétention, restauration et droits ; gratuité non présumée |

Pistes supplémentaires trouvables via le répertoire : GlitchTip pour erreurs, services de CI et hébergement alternatifs. Leurs quotas exacts n'ont pas tous été vérifiés ; les liens officiels de la matrice servent à les examiner avant achat. Les logiciels auto-hébergés tels que Keycloak ou PostgreSQL ne sont pas « gratuits à exploiter » : administration, patchs, sauvegardes et incidents consomment du temps et du budget.

## Trois architectures économiques comparables

| Option | Composition | Atout | Limite et condition |
|---|---|---|---|
| A — Managé recommandé pour petite équipe | Render payant + Supabase payant + email + copie sauvegarde séparée | Réduit les services à administrer | Dépendances fournisseurs et transferts à examiner ; budget mensuel non nul |
| B — Réutilisation Vercel | Client existant sur plan commercial + API/worker + PostgreSQL géré | Évite migration client non nécessaire | Plusieurs factures et origines possibles ; session/CSRF à tester |
| C — VPS maîtrisé | Application/worker conteneurisés + PostgreSQL + identité + backups séparés | Contrôle opérationnel et coûts directs potentiellement prévisibles | Forte charge Ops ; pas haute disponibilité par simple VPS unique |

Aucune somme cloud mensuelle globale n'est annoncée sans région, taille, nombre d'environnements et devis. Le budget source de 200 000 XAF pour hébergement/messages du pilote n'indique pas sa durée détaillée ; le convertir en coût mensuel implicite serait trompeur.

## Grille d'achat à remplir pour chaque fournisseur retenu

Nom et offre ; rôle ; région primaire et secours ; données transférées ; DPA et sous-traitants ; restrictions d'usage commercial ; quota et comportement à épuisement ; coûts fixes/variables/sièges/traﬁc ; taxes et devise ; sauvegarde et restauration ; SLA contractuel ; support ; portabilité des données ; export des identités ; procédure de résiliation ; propriétaire du compte ; MFA et révocation ; date de vérification et lien preuve.

Calcul mensuel : abonnements fixes + unités consommées × tarifs + sièges + stockage/sortie + support + taxes/change. Mesurer aussi le coût humain des solutions auto-hébergées. Préparer un export PostgreSQL, les migrations et une restauration chez un autre hébergeur avant de promettre la réversibilité. Conserver la grille JSON pour les devis réels.
