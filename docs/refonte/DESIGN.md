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

## 1. Direction retenue

**Ndop : l'argent du groupe, tissé.** Choix fait sur demande de lancer sans attendre ; les deux autres pistes écartées :
- *Marché* (ocre, très arrondi) : chaleureux mais vite enfantin.
- *Papier* (ivoire, encre, serif) : élégant, c'est ce que nous avions, jugé fade.

**Couleurs.** L'ancien vert ne reste que dans le logo et pour dire « confirmé ».

| Jeton | Hex | Rôle |
|---|---|---|
| Indigo | `#161A5C` | Surface dominante, texte fort |
| Nuit | `#0E1140` | Profondeur |
| Indigo vif | `#2F35A8` | Liens, focus |
| Maïs | `#F5B700` | L'argent et l'action principale (texte encre dessus) |
| Maïs texte | `#7A5600` | Or lisible sur fond clair |
| Vermillon | `#C92A12` | Retard, erreur, lisière |
| Confirmé | `#0B7A53` | Paiement confirmé, seul vert de l'interface |
| Coton | `#F5F5FB` | Fond (bleuté : surtout pas crème) |
| Teinte | `#E4E5FA` | Sélection, pictos |
| Encre | `#12142E` | Texte |
| Ardoise | `#4E5270` | Texte secondaire (AA sur coton) |
| Filet | `#DADBF0` / `#C3C5E6` | Traits |

**Polices.** Fraunces 600–700 pour montants et titres, Manrope pour le reste. Déjà embarquées : aucun poids ajouté, aucun téléchargement. Les montants sont très grands, comme une enseigne peinte.

**Signature : la bande du cycle.** Un rang de blocs, un par tour : tissés en maïs quand ils sont passés, blanc pour le tour en cours, vide à venir, et mon tour marqué d'un losange. Elle remplace l'anneau et dit d'un coup d'œil où en est le groupe.

**Lisière.** Le héros se termine par une bordure de triangles maïs et vermillon (toghu), pas par des coins arrondis.

**Motif.** Vectoriel, présent et assumé sur les surfaces indigo. Jamais sous un texte de lecture. Aucune photo décorative.

**Mouvement.** Trois moments seulement : le bloc du tour qui se tisse (recevoir), le sceau « confirmé », le retard qui se pose sans trembler. `prefers-reduced-motion` respecté.

**Garde-fous.** AA minimum, cibles 48 px, texte 14 px minimum hors pastilles, pas de cartes blanches empilées sans raison. L'écran de connexion PWA ne change pas.

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

## 4. Forme et identité (au-delà des couleurs)

- **Coupe de tissu.** Coins chanfreinés sur boutons, pictos, pastilles, cartes : plus de pilules ni de grands arrondis.
- **Blason de tontine.** Chaque groupe a une teinte et un motif stables (indigo, vermillon, vert, indigo vif), un losange avec ses initiales ; la photo du groupe prend la même découpe.
- **Membres.** Disques de couleurs franches, initiales Fraunces.
- **Coupon de tissu.** Un groupe = un coupon à sa couleur, fermé par la lisière. Pas une carte blanche.
- **Listes cousues.** Rangées posées sur le fond, séparées par un point de couture. Frise cousue pour l'Activité.
- **Titres.** Fraunces 700 partout où il y a un titre (barre, sections, en-têtes).
- **Barre du bas.** Indigo, bloc maïs pour l'onglet actif.
- **Reçoit ce tour.** Coupon maïs : le moment fort du cycle.
- **Retard.** La lisière passe au vermillon, rien de plus : on informe, on n'humilie pas.
