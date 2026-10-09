# KÓMBE — Direction créative

**Statut :** canonique · 2026-10-08
**Prototypes :** `docs/brand/directions/*.html` · captures `docs/brand/screens/direction-*.png`
**Audit préalable :** [KOMBE_VISUAL_AUDIT.md](KOMBE_VISUAL_AUDIT.md)

## 1. Les trois directions explorées

| | 01 — Quiet Authority | 02 — Living Circle | 03 — Contemporary African Editorial |
|---|---|---|---|
| **Idée** | Le registre. KÓMBE comme institution. | Le cercle vivant. Le groupe *est* l'interface. | Le magazine. KÓMBE comme voix culturelle. |
| **Composition** | Grille suisse 12 colonnes visible, filets, alignement à gauche, aucune image. | Une orbite plein écran comme scène ; texte et UI émergent de la géométrie. | Asymétrie 58/42, photo pleine hauteur, typographie qui déborde la photo. |
| **Typographie** | Fraunces opsz 144 « SOFT 0 » (sec), chiffres Manrope 300 maigres. | Fraunces « SOFT 50 » + capitales Manrope 800 en contrepoint. | Manrope 800 à 168 px + Fraunces italique « WONK ». |
| **Mouvement** | Fondus uniquement. | Convergence des nœuds → fermeture de l'anneau → émergence de l'UI. | Liste de verbes cinétique, rythme de bandeau. |
| **Photographie** | Aucune. | Masquée dans un nœud de l'orbite (la personne *est* un membre). | Plein cadre, éditoriale, contrastée. |
| **UI produit** | Cadre encre, filets, registre ligne à ligne. | Orbite de cycle en tête, carte « prochaine action », timeline reliée par un chemin. | Blocs de couleur pleins, chiffres géants, capitales. |
| **Langage** | « Le registre de votre tontine. » | « Votre tontine, plus claire. » | « ENSEMBLE. *clairement.* » |

## 2. Notation (/10)

| Critère | 01 Quiet Authority | 02 Living Circle | 03 Editorial |
|---|---:|---:|---:|
| Distinctivité | 6 | **9** | 8 |
| Confiance | **9** | 8 | 6 |
| Utilisabilité | **9** | 8 | 6 |
| Mobile | 8 | **9** | 6 |
| Pertinence africaine | 5 | 8 | **9** |
| Scalabilité (système) | 7 | **9** | 5 |
| Accessibilité | **9** | 8 | 6 |
| Performance | **9** | 8 | 6 |
| Impact marketing | 6 | 8 | **9** |
| Longévité | 8 | **9** | 6 |
| **Total** | **76** | **84** | **67** |

**Notes qui ont pesé :**
- 01 réussit le test de confiance mais échoue au test du §1 du mandat : avec un autre logo, ce serait une banque privée.
- 03 a le hero le plus mémorable, mais il **dépend d'une photographie** que le projet ne possède pas (une seule image générée), et son bandeau rythmique est de la décoration sans donnée — contraire au §13. Les blocs pleins et les capitales nuisent à la lecture des montants.
- 02 est la seule direction où **l'idée de marque est aussi la donnée** : 12 nœuds = 12 membres, nœud or = bénéficiaire, arc = progression. Elle se reconnaît sans logo, se génère à partir de paramètres réels et vit aussi bien sur le site que dans l'app.

## 3. Choix : 02 Living Circle, discipliné par 01

Hybridation **justifiée par le modèle à trois couches** et non par compromis esthétique :

| Couche | Intensité | Ce qui vient de 02 | Ce qui vient de 01 | Ce qui vient de 03 |
|---|---|---|---|---|
| **A — Marque / marketing** | Maximale | Orbite plein écran, convergence, photo masquée en nœud | — | La **séquence de verbes** (Organiser · Contribuer · Valider · Décider) comme fil narratif des actes du site. Rien d'autre. |
| **B — Onboarding** | Modérée | Convergence des nœuds racontée en 3 écrans | Une phrase par écran | — |
| **C — Produit financier** | Minimale | L'orbite comme ancre du cycle, les statuts par la forme | Filets, chiffres tabulaires, cadre encre de la tâche, registre ligne à ligne, zéro animation spatiale sur les montants | — |

Ce qui est **rejeté** : le bandeau à motif (03), la grille visible en fond (01), les lueurs floues et le `backdrop-filter` de l'existant, toute pièce de monnaie, tout motif textile utilisé comme papier peint.

## 4. Le signe propriétaire : l'orbite de confiance

Une seule grammaire génère toutes les compositions :

| Forme | Sens | Règle |
|---|---|---|
| Cercle (anneau de fond) | Le groupe | Toujours présent, couleur `sand-200`. |
| Nœud | Un membre / un tour | N nœuds = N tours réels. Jamais un nombre décoratif. |
| Nœud plein forêt | Tour passé | |
| Nœud or + halo | Bénéficiaire du tour courant | Seul usage récurrent de l'or dans le produit. |
| Nœud creux | Tour à venir | |
| Arc forêt | Progression du cycle | De T1 au tour courant. |
| Arc ouvert | En attente | Statut d'une cotisation déclarée. |
| Anneau fermé + coche | Confirmé | |
| Chemin rompu | Contesté | |
| Segment pointillé | Hors connexion | |
| Orbite en rotation lente | Synchronisation | Seule animation continue autorisée, et seulement pendant l'opération réelle. |

Implémentations : `CycleOrbit` (React, `packages/dashboard-core`), `KombeCycleOrbit` (Flutter `CustomPainter`), `orbit.ts` (site). Mêmes paramètres, même géométrie.

## 5. Le moment signature

**Convergence → fermeture.** Des nœuds dispersés (des individus) rejoignent l'orbite, l'anneau se forme, l'arc enregistre la progression. Intensité adaptée :
- Site : 1,6 s, une fois, au chargement du hero.
- Onboarding : découpé en 3 écrans, piloté par l'utilisateur.
- Accueil mobile : 420 ms, seulement au premier affichage d'un groupe.
- Validation : l'arc d'un statut se ferme (320 ms) puis la coche se trace (220 ms). Pas de confettis.
- `prefers-reduced-motion` : état final directement, sans translation.

## 6. Signature verbale
**« Votre tontine, plus claire. »** — l'ancienne signature « Ma tontine, simplement. » est retirée (voir audit A2).
