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

**Ndop vert : l'argent du groupe, tissé.** Le vert forêt reste la couleur de KÓMBE (essai en indigo abandonné : il cassait l'identité). Le caractère vient des formes, de la typographie et des photos, pas d'un changement de marque.

**Couleurs.** Le vert forêt domine ; quatre accents francs donnent la vie (l'interface manquait de couleur).

| Jeton | Hex | Rôle |
|---|---|---|
| Forêt | `#103C32` | Surface dominante, texte fort |
| Soleil | `#F2B01E` | L'argent et l'action principale (texte encre dessus) |
| Émeraude | `#0C8060` | Confirmé, liens, cycle |
| Corail | `#C8412A` | Séances, membres, rappels |
| Prune | `#6C2A6B` | Votes, règles |
| Or texte | `#8A5F14` | Or lisible sur fond clair |
| Danger | `#B42318` | Retard, erreur |
| Ivoire | `#FBF8F1` | Fond |
| Menthe | `#DCEFE6` | Sélection |
| Encre | `#13211C` | Texte |
| Ardoise | `#56645E` | Texte secondaire |
| Filet | `#E7DCC6` / `#D9D0BC` | Traits |

**Polices.** Fraunces 600–700 pour montants et titres, Manrope pour le reste. Déjà embarquées : aucun poids ajouté, aucun téléchargement. Les montants sont très grands, comme une enseigne peinte.

**Signature : le rang de perles.** Une perle par tour : or quand le tour est passé, cerclée pour le tour en cours, vide à venir. Il dit d'un coup d'œil où en est le groupe.

**Formes.** Tout est rond : boutons pilules, avatars et pictos en disques, cartes à grands arrondis. Pas de triangles, pas de coins coupés (décision de l'utilisateur après essai).

**Motif.** Anneaux vectoriels, présents sur les surfaces forêt. Jamais sous un texte de lecture. Aucune photo décorative.

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

## 4. Identité

- **Photos.** Chaque tontine et chaque membre a une photo de profil, ronde. Les initiales ne sont qu'un repli tant qu'aucune photo n'a été envoyée.
- **Teinte de tontine.** Chaque groupe a une teinte stable (forêt, émeraude, corail, prune) et le motif d'anneaux.
- **Coupon.** Un groupe = une carte à sa couleur. Pas une carte blanche.
- **Listes cousues.** Rangées posées sur le fond, séparées par un point de couture. Frise cousue pour l'Activité.
- **Titres.** Fraunces gras partout où il y a un titre.
- **Barre du bas.** Forêt, disque soleil pour l'onglet actif.
- **Reçoit ce tour.** Carte soleil : le moment fort du cycle.
