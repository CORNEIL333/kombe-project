# Mettre KÓMBE en ligne — en quelques clics

Dernière mise à jour : 13 octobre 2026 (branche `claude/continue-previous-a102rx`).

**Tout le produit tient dans UN seul projet Vercel** : l'API (`/v1/…`), la PWA
des membres (`/`), l'Espace bureau (`/bureau/`) et les tableaux de bord
Opérations (`/ops/`), Direction (`/direction/`) et Engineering
(`/engineering/`). Même adresse pour tout : pas de CORS à régler, pas d'URL à
recopier dans des fichiers, pas de compte Cloudflare. Les migrations de la base
s'appliquent toutes seules pendant le build de production.

---

## Avant de commencer (5 minutes, une seule fois)

Vous avez besoin de **deux chaînes de connexion** vers la base Neon `kombe_prod`
(console Neon → *Connect* → choisir la base `kombe_prod`, connexion **directe**,
pas le *pooler*) :

| Variable | Rôle PostgreSQL | Sert à |
|---|---|---|
| `KOMBE_API_DATABASE_URL` | `kombe_app` (celle de `.env.prod`, `KOMBE_PROD_API_DATABASE_URL`) | l'API, sous RLS |
| `KOMBE_MIGRATION_DATABASE_URL` | `neondb_owner` (propriétaire) | appliquer les migrations au build |

Et **au moins une voie de connexion** pour les membres :

- **E-mail (disponible tout de suite)** : `RESEND_API_KEY` (compte Resend
  existant) + `KOMBE_EMAIL_FROM`. Tant qu'aucun domaine n'est vérifié chez
  Resend, l'expéditeur `onboarding@resend.dev` ne livre **qu'à l'adresse du
  propriétaire du compte Resend** : parfait pour vos essais, insuffisant pour
  de vrais membres (voir « Ouverture au public »).
- **SMS (recommandé au Cameroun)** : `KOMBE_SMS_PROVIDER=africastalking`,
  `AFRICASTALKING_USERNAME`, `AFRICASTALKING_API_KEY` (compte Africa's Talking
  à créer, ~10 min). Sans ces variables l'API démarre quand même : la voie SMS
  est simplement fermée et la PWA ne propose que l'e-mail.

---

## 1. Fusionner le travail sur `master` (1 clic)

Sur GitHub, ouvrir la pull request de `claude/continue-previous-a102rx` vers
`master` et cliquer **Merge**. Vercel déploie en production la branche
`master`.

## 2. Créer le projet Vercel (4 clics)

1. vercel.com → **Add New… → Project** → importer `CORNEIL333/kombe-project`.
2. *Framework Preset* : **Other**. *Root Directory* : laisser la racine.
   Ne rien changer d'autre : `vercel.json` fournit déjà l'installation, le
   build (`node scripts/vercel-build.mjs`), le dossier publié (`dist-web`),
   la route `/v1/*` vers l'API et les en-têtes de sécurité.
3. *Environment Variables* (portée **Production**) — coller :

   | Nom | Valeur |
   |---|---|
   | `KOMBE_API_DATABASE_URL` | chaîne `kombe_app` → `kombe_prod` |
   | `KOMBE_MIGRATION_DATABASE_URL` | chaîne `neondb_owner` → `kombe_prod` |
   | `RESEND_API_KEY` | clé Resend |
   | `KOMBE_EMAIL_FROM` | `KÓMBE <onboarding@resend.dev>` (puis votre domaine) |
   | `KOMBE_SMS_PROVIDER` + identifiants | *facultatif*, voir plus haut |

4. **Deploy**.

Le build fait, dans l'ordre : compilation de l'API → assemblage du site →
**migrations** (0026 à 0029 manquent aujourd'hui sur `kombe_prod`, qui est à
27 jalons ; elles s'appliquent ici, une seule fois). Si une étape échoue, rien
n'est mis en ligne.

## 3. Vérifier (1 commande ou 1 clic)

Ouvrir `https://<votre-projet>.vercel.app/v1/health/ready` → doit afficher
`{"status":"ready","mode":"réel"}`. Ou, depuis un poste :

```bash
KOMBE_SMOKE_BASE_URL=https://<votre-projet>.vercel.app node scripts/release-smoke.mjs
# → "status": "SMOKE_PASS" (API, voies de connexion, PWA et 4 tableaux de bord servis)
```

## 4. Vous connecter et devenir opérateur (2 minutes)

1. Ouvrir `https://<votre-projet>.vercel.app/` → se connecter (e-mail du
   compte Resend, ou téléphone si le SMS est configuré) → saisir son nom.
2. Donner à ce compte la fonction d'**opérateur de la plateforme** (accès à
   `/ops/`, `/direction/`, `/engineering/`). Au choix :
   - console Neon → *SQL Editor* → base `kombe_prod` :
     ```sql
     UPDATE identity_access SET is_operator = true
      WHERE identity_id = 'votre@email.cm';   -- ou '+2376XXXXXXXX'
     ```
   - ou depuis un poste : `KOMBE_DATABASE_URL=<chaîne neondb_owner> node packages/db/scripts/grant-operator.mjs votre@email.cm`
3. Ouvrir `/ops/`, `/direction/`, `/engineering/` : l'Engineering doit
   afficher **Schéma : À jour** (29 migrations + rôles).

Le bureau d'un groupe (président, secrétaire, trésorier, commissaire) n'a
besoin de rien : il ouvre `/bureau/` avec son propre compte.

---

## Ouverture au public (quand vous êtes prêt)

| Action | Où | Pourquoi |
|---|---|---|
| Vérifier un domaine chez Resend (DKIM/SPF) et mettre `KOMBE_EMAIL_FROM=no-reply@votre-domaine` | Resend + Vercel | sinon les codes e-mail n'arrivent qu'au propriétaire du compte Resend |
| Compte Africa's Talking (SMS Cameroun) + 3 variables | Africa's Talking + Vercel | connexion par téléphone, la plus naturelle pour les membres |
| Domaine personnalisé (ex. `app.kombe.cm`) | Vercel → Domains | les liens d'invitation WhatsApp utilisent automatiquement ce domaine ; sinon `KOMBE_PUBLIC_APP_URL` |
| Numéro d'astreinte et contact données personnelles | `/ops/` → Incidents & runbooks | exigé avant ouverture |

## Ce qui reste hors de ce guide (non bloquant)

- **Application mobile Flutter** (Android/iOS) : le code est dans
  `packages/mobile` ; son build et ses tests n'ont pas pu être exécutés ici
  (outils Flutter absents). Le web (PWA) couvre tous les parcours. Voir
  `docs/BLOCAGES_TONTINE_REELLE.md`.
- **Sauvegarde / restauration testées** (`pg_dump`/`pg_restore`, DEPLOY.md §6) :
  Neon fournit la restauration à un instant donné ; l'exercice complet reste à
  faire sur un poste outillé.
- **Ancien découpage** (API seule sur Vercel, tableaux de bord sur Cloudflare,
  `KOMBE_CORS_ORIGINS`) : toujours possible (DEPLOY.md §7), plus nécessaire.
  Pour un hébergement Docker (Render), poser `KOMBE_WEB_ROOT=/app/dist-web`
  après `node scripts/build-web.mjs` : l'API sert alors le même site.

## Garde-fou

Les preuves de recette (`scripts/proofs-local.sh`, `packages/**/*.proof.mjs`)
**effacent** le schéma de la base visée. Elles refusent `kombe_prod`
(`packages/db/scripts/guard.mjs`) : ne jamais les pointer vers la production.
