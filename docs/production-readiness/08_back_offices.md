# 08 — Back-offices (`/bureau`, `/ops`, `/direction`, `/engineering`)

## Accès

**Espace bureau** (`/bureau`) : réservé aux responsables d'une tontine. Les droits viennent des fonctions du groupe (président, trésorier, commissaire…), vérifiées par le serveur.

**Consoles de la plateforme.** Chacune exige une fonction d'opérateur et le second facteur :

| Console | Fonction(s) exigée(s) |
|---|---|
| `/ops` | operations ou support |
| `/direction` | direction |
| `/engineering` | engineering |

La fonction `admin` ouvre toutes les consoles.

**Parcours du second facteur**, vérifié dans Chromium contre une API et une PostgreSQL locales :
1. « Commencer » : la clé et le lien `otpauth` sont montrés une seule fois.
2. Saisie du premier code. Un code faux est refusé avec un message clair.
3. Affichage des 10 codes de secours, une seule fois.
4. Ouverture de la console.
5. Une nouvelle session redemande un code, et l'ancien code ne peut pas être rejoué.

Le message « Cette console demande une autre fonction » indique la fonction requise et celles détenues : il n'y a jamais de page vide.

## Accessibilité (WCAG 2.2 AA)

**Analyse automatique axe-core 4.10** (règles WCAG 2.0, 2.1 et 2.2, niveaux A et AA) :
- 12 écrans : PWA (connexion, accueil, groupes, groupe, membres, notifications, profil, cotisations) et les 4 consoles ;
- à 390 px et 1280 px ;
- **24 analyses sur 24 sans violation** après correctifs.
- Résultat brut : `mesures/accessibilite-axe-2026-11-04.json`.

**Correctifs apportés.**
- Contraste du texte secondaire : 4,16:1 avant, environ 4,9:1 après (ink-600).
- Tableaux défilants des consoles : focus clavier, région nommée et focus visible.

**Limites honnêtes.**
- L'analyse automatique ne couvre qu'une partie des critères.
- Les tests suivants restent **NOT_TESTED** : lecteurs d'écran (TalkBack, NVDA), zoom à 200 %, navigation complète au clavier sur chaque parcours.
