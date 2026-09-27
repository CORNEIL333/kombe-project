# ADR-0007 — Isolation multi-tenant (RLS + clés étrangères composites)

- **Statut :** ADOPTÉ (**contrat** posé par C00) — exécution **BLOCKED** sans PostgreSQL.
- **Auteur :** Lead technique C00 (contrat) / C01 (preuve réelle) • **Date :** 2026-09-27
- **Contexte / origine :** `ARCHITECTURE_CIBLE.md` §Isolation ; `RISQUES_AGENTS_IA.md`
  (fuite inter-groupes) ; `01_Audit` règles 14.1/18.x. Schéma : `packages/db/migrations/0001_init.sql`.

## Décision
- **Chaque objet métier porte `group_id`** ; les relations sont **UNIQUE/FK composites**
  sur `(group_id, id)` — l'isolation est **structurelle**, pas seulement applicative :
  une référence qui franchirait la frontière de groupe est **impossible** sans aligner
  le `group_id`.
- **RLS activée** sur toute table tenant-scope (`membership`, `role_assignment`,
  `rule_version`, `rules_acceptance`, `round`, `obligation`, `contribution`,
  `disbursement`, `vote`, `dispute`, `journal`). Politique `tenant_isolation` :
  `USING (group_id = current_setting('kombe.group_id', true))`.
- Contexte posé **par transaction** : `SET LOCAL kombe.group_id = '...'` — jamais global,
  pour ne pas fuir d'une requête à l'autre via une connexion de pool partagée.
- Le rôle applicatif `kombe_app` **n'est pas superuser** et **n'a pas `BYPASSRLS`**
  (créé hors migration par le provisionneur).
- Unicité structurelle clé : **une seule adhésion active** par (groupe, identité)
  via `active_marker` généré + `UNIQUE` ; **une seule validation** par
  (contribution, rôle) ; **un bulletin** par (vote, identité).
- Cohérence « sous verrou » bornée en SQL : `validated_net <= active_reserved <= due_amount`.

## Alternatives rejetées
- Isolation purement applicative (filtre `WHERE group_id=?` en code) — un oubli = fuite ;
  la RLS est une **ceinture et bretelles**, pas un remplacement de l'anti-IDOR (ADR-0006).
- Schéma par tenant (une base/schema par groupe) — explosion opérationnelle, migrations
  multipliées ; non retenu pour un registre de petits groupes.
- `SET` global de session pour le contexte — persiste entre requêtes sur une connexion
  rendue au pool → contamination inter-tenant ; d'où `SET LOCAL` transactionnel.

## Conséquences
- La migration est un **contrat exécutable**, pas une exécution : `pnpm --filter @kombe/db migrate`
  renvoie **BLOCKED (code 2)** sur un hôte sans base (voir `packages/db/README.md`).
- Les preuves **base réelle** — RLS effective sur `kombe_app`, verrous, test d'isolation
  de pool (100 requêtes A/B entremêlées), atomicité — sont le **lot C01** sur
  PostgreSQL 16+ via Testcontainers. Statut courant : **BLOCKED**, jamais simulé.
