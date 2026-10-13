# KÓMBE — Rédaction de l'interface

**Ton :** humain · précis · court · non technique. On décrit ce qui **est**, jamais une intention future ni une garantie.

## 1. Règles
1. Un statut se dit en toutes lettres, avec son auteur quand il existe : « Validée par le trésorier · 14:32 ».
2. Avant une action critique, dire : **ce qui va se passer · qui le verra · si c'est modifiable · qui doit valider**. Ex. sous le bouton de déclaration : « Après votre déclaration, un membre autorisé devra la valider. »
3. Ne jamais traduire `queued` / local par « envoyé » ou « réussi ».
4. Les verbes des boutons nomment l'action : « Déclarer ma cotisation », « Rejoindre une tontine », pas « Valider » / « OK » / « Continuer » génériques.
5. Les montants : `25 000 XAF` (espace insécable, chiffres tabulaires), jamais coupés sur deux lignes.
6. Aucune promesse sur les fonds. KÓMBE **ne détient jamais** l'argent du groupe — on peut le dire, c'est vrai.

## 2. Remplacements faits pendant le redesign
| Avant | Après | Où |
|---|---|---|
| « Sécurisé — Vos fonds sont protégés » | « Traçable — Chaque cotisation est datée et validée par le groupe » | PWA, connexion |
| « Durable — Pour vos projets d'aujourd'hui et de demain » | « Honnête — KÓMBE ne détient jamais l'argent du groupe » | PWA, connexion |
| « Épargne & Tontine en Afrique » | « Votre tontine, plus claire. » | PWA, connexion |
| « Ensemble, plus loin » / « Ma tontine, simplement. » | « Votre tontine, plus claire. » | PWA, Flutter, dashboards |
| « Registre de tontines fermées » | « Votre tontine, plus claire. » | PWA, en-tête |
| `item.status.name` (`received`, `upcoming`) affiché tel quel | « Reçu », « Tour en cours », « À venir » | Flutter, cycle |
| « Ensemble pour aller plus loin. » (onboarding) | « Votre tontine. / Organisée ensemble. / Chaque étape reste claire. » | Flutter, accueil |

## 3. Bibliothèque de messages
| Situation | Texte |
|---|---|
| Aucun groupe | Vous n'avez encore rejoint aucune tontine. |
| CTA vide | Rejoindre une tontine |
| Aucun événement | L'historique de ce groupe apparaîtra ici. |
| Déclaration envoyée | Déclaration envoyée. Elle reste en attente de validation. |
| Validation | Validation enregistrée. |
| Conflit (409) | Cette cotisation a changé depuis votre dernière consultation. Actualisez avant de continuer. |
| 403 | Vous n'avez pas l'autorisation d'effectuer cette action. |
| Réseau | Connexion interrompue. Votre saisie est conservée sur cet appareil. |
| Brouillon hors ligne | Brouillon enregistré sur cet appareil. Il n'a pas encore été envoyé au groupe. |
| Retour réseau | Connexion rétablie. Vérification des changements… |
| Cache | Dernière mise à jour : 14:32. |
| Session expirée | Votre session a expiré. Reconnectez-vous pour continuer. |
| Retrait d'un membre | Retirer ce membre du groupe ? (jamais « Êtes-vous sûr ? ») |
| Vote | Votre vote a été enregistré. — seulement après confirmation serveur |

## 4. Interdits
« Transaction processed successfully », « Error 409 », « Network request failed », « fonds garantis », « 100 % sécurisé », urgence artificielle (« Plus que 2 h ! »), consentement précoché, faux chiffres d'usage, faux témoignages.
