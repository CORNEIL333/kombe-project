# Actions du porteur — ce qui débloque la suite

Le reste du travail avance seul (voir `AUTONOMY_STATE.md`). Chaque point ci-dessous ne peut être fait que par le porteur. Ils sont classés par effet.

## 1. Libérer une place de sauvegarde Neon → déploiement des migrations 0044 à 0046

- **Pourquoi.** Le projet Neon a atteint sa limite de 10 branches. Or toute migration en production exige d'abord une sauvegarde.
- **Ce qui attend :**
  - les alertes au support (nouvelle demande, réponse) ;
  - la RLS de `"group"` ;
  - les alertes de délai de service ;
  - « mes tontines » plus rapide (R-04).
- **Comment.** Supprimer `sauvegarde-avant-0-8-1-20261106` :
  - soit dans la console Neon (projet *kombe* → Branches → la branche → Delete) ;
  - soit en écrivant simplement « je t'autorise à supprimer la sauvegarde 0.8.1 ».
- **Ensuite (automatique) :** sauvegarde 0.9.2, déploiement, contrôles, fusion dans `master`.

## 2. Relancer la CI GitHub Actions

- **Constat (11/11).** Les jobs s'arrêtent en une seconde, sans exécuter une seule étape, sur toutes les exécutions récentes. C'est typique d'un compte ou d'une limite de dépense bloqués.
- **Comment.** Sur GitHub, **Settings → Billing and plans** : vérifier le moyen de paiement ou la limite de dépense Actions, puis relancer une exécution.

## 3. Relier Vercel à GitHub (déploiement automatique depuis `master`)

- **Comment.** Sur vercel.com, projet **kombe** → **Settings → Git → Connect Git Repository** → `CORNEIL333/kombe-project`, branche de production `master`.
- **Sans risque pour la base.** Les secrets ne sont donnés qu'à la production, et les aperçus n'appliquent aucune migration.
- **À retenir.** Avant de fusionner une migration dans `master`, lancer d'abord `node scripts/neon-sauvegarde.mjs <version>`.

## 4. Premier opérateur de la plateforme

- **Comment.**
  1. Se connecter une fois sur `kombe.vercel.app` pour que le compte existe.
  2. Depuis un poste qui atteint la base : `KOMBE_DATABASE_URL='<URL migrateur>' node packages/db/scripts/grant-operator.mjs +2376XXXXXXXX --roles=admin`.
  3. Ouvrir `/crm/`, activer le second facteur et ranger les codes de secours.

## 5. Publier l'application mobile

- **Comment.** Depuis le PC qui porte la clé de signature : `node scripts/mobile/publier.mjs`.
- **Nouveauté de cette version.** « Mes demandes au support ».

## 6. Décisions à prendre

- **Neon payant**, si 5 000 arrivées dans la même minute doivent rester rapides (voir 12).
- **Firebase** (`google-services.json`) pour les notifications push sur téléphone (R-07). Le Push Web de la PWA, lui, n'a besoin d'aucun compte (A14) : il partira dès l'ouverture des envois.
- **Ouvrir les envois hors application** (`KOMBE_NOTIFY_EXTERNAL=on`) : rien ne part sans cette décision, ni push, ni SMS, ni e-mail.
- **Validation juridique** :
  - loi n° 2024/017 : base légale du support, conservation de 730 jours, transfert hors du Cameroun ;
  - réglementation CEMAC/COBAC.
