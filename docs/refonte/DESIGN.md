# KÓMBE — DESIGN.md (direction « Ndop »)

Fichier verrouillé : tout écran, mobile comme PWA, en dérive. Toute exception s'écrit ici d'abord.

## 0. Comprendre

**Qui.** Commerçantes, enseignants, chauffeurs, agents de bureau, 25–60 ans, à Douala, Yaoundé, Bafoussam et dans la diaspora. Android d'entrée de gamme, écran 5–6 pouces, souvent en plein soleil, connexion 3G instable, forfait compté. Français parfois deuxième langue, lecture rapide. Le trésorier, lui, prépare la séance sur un portable ou une tablette.

**État d'esprit.** On confie son argent à des gens qu'on connaît : confiance, mais peur d'être trompé. Fierté quand le pot arrive. Gêne quand on est en retard, et pas envie que l'app l'humilie. Le groupe compte plus que l'outil.

**Cinq moments.** 1) Recevoir le pot. 2) Payer sa part. 3) Être en retard. 4) Voir son paiement confirmé. 5) Voter une règle.
**Le visage de l'app : le tour.** Le pot qui avance vers soi. C'est ce qui fait tenir une tontine, et aucune appli de paiement ne le montre.

**Trois tâches.** Membre : payer ma part ; savoir quand je reçois ; voir que mon paiement est confirmé. Trésorier : confirmer les paiements ; voir qui est en retard ; préparer la séance. Tout le reste est secondaire et rangé dans le groupe.

**Références (hors fintech, de mémoire, non vérifiées en ligne).**
| Référence | Ce qu'on en retient |
|---|---|
| Ndop (tissu teint en réserve, Grassfields) | Indigo profond, réserves blanches, géométrie faite main : couleur dominante et motif |
| Toghu (velours brodé, Nord-Ouest) | Bordures de triangles rouge et jaune sur fond sombre : la lisière |
| Masque éléphant kuosi (perles bamiléké) | Blocs de couleur juxtaposés : la bande du cycle, comme un rang de perles |
| Velours de raphia kuba (Kasaï) | Rythme volontairement irrégulier : le motif n'est pas un papier peint |
| Enseignes peintes des salons de coiffure | Un mot, très grand, lisible de loin : hiérarchie, un seul message |
| Les Têtes Brûlées (bikutsi, corps peints) | Audace assumée, couleur sur peau sombre : ne pas s'excuser d'être voyant |

## 1. Direction retenue : le calme

**Une seule audace par écran, tout le reste est calme.** La personnalité vient du serif, des monogrammes, de la langue et d'un seul accent, pas de la quantité de couleurs. Essais abandonnés : indigo (cassait l'identité), multicolore (illisible).

| Jeton | Hex | Rôle |
|---|---|---|
| Vert marque | `#12805C` | Aplats, héros, sélection (4,9:1 avec du texte blanc) |
| Safran | `#F2B01E` | L'action, texte encre dessus |
| Forêt | `#103C32` | Texte et icônes uniquement, jamais en aplat |
| Ivoire, sable, menthe | `#FBF8F1`, `#F3ECDD`, `#DCEFE6` | Fonds neutres chauds |
| Encre, ardoise | `#13211C`, `#56645E` | Texte |
| Danger | `#B42318` | Retard et erreur seulement |
| 8 teintes douces | voir `KombeColors.tints` | Monogrammes et liserés, texte toujours encre |

**Règles.** Trois teintes au plus par écran. Motif jamais derrière du texte, une seule zone décorative par écran au maximum. Texte 14 px minimum, contraste 4,5:1, cibles 48 px. Fraunces sur les noms et les montants, Manrope pour le reste. Tout est rond. Pas de photo décorative.

**Carte de groupe.** Une structure, même hauteur : avatar, nom, fonction, « À payer » en plus gros texte, points du cycle, un seul chevron, liseré d'identité. Rien à payer : ligne masquée. En attente : carte grise, « En attente ». Tri par urgence.

**Points du cycle.** Petits, un par tour : pleins si passés, safran pour le tour en cours, vides à venir, rouge en retard.

**Contrôles avant de montrer un écran.** Flou en niveaux de gris (le paiement urgent se voit en 2 secondes), comptage des teintes, audit automatique (taille, contraste, cibles, aplats).

## 2. Arborescence

```
Accueil        payer, mon tour, ce qui m'attend
Cotisations    à payer, payés
Groupes        mes groupes > groupe (membres, tours, caisses, règles, séances, bureau)
Activité       ce qui s'est passé
```
Un seul chemin par fonction. La cloche ouvre les non-lus. Bureau (ordinateur) : colonne à gauche, pas de barre du bas.

## 3. Glossaire

| Avant | Maintenant |
|---|---|
| Déclarer un versement | J'ai payé |
| Déclaration | Paiement |
| Statuts | Règles |
| Bénéficiaire | Qui reçoit |
| Cagnotte du tour | Le pot |
| Contrôles croisés | (supprimé) |

Tour, cycle, séance, caisse, bureau, cotisation : gardés, ce sont les mots des tontines.
Interdits dans le produit : « épargne », « retrait ».

## 4. Photos

Chaque tontine et chaque membre a une photo de profil, ronde. Le monogramme n'est qu'un repli tant qu'aucune photo n'a été envoyée.
