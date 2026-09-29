# Conventions Git multi-harnais

Ces règles rendent l'**auteur** de chaque commit identifiable et la **revue**
authenticable — le point que le cas **H06** du dossier d'audit refuse de laisser
repose sur « deux noms textuels ».

## 1. Préfixe d'auteur dans le message de commit

Format : `<harness_id>(<lot>[: <sous-type>]): <résumé>`

| Exemple | Sens |
|---|---|
| `qoder(C08): module décaissements + oracle rapprochement` | qoder produit C08 |
| `codex(C06): preuve idempotence sous verrou` | codex produit C06 |
| `claude-code(review C05): rejects rotation inégale` | claude-code **relit** C05 |
| `corneil333(C28/promote): activation branch protection` | le **lead** promeut une modif du contrôleur |

Le `harness_id` doit exister dans `REGISTRE_HARNESS.json`. Un commit d'un
`harness_id` inconnu est refusé par `verifier_coordination.py`.

## 2. Séparation auteur / relecteur (H06)

- Un passage `in_review → done` dans `ETATS_LOTS.json` doit être commité par un
  harnais **différent** de l'`owner_harness_id` du lot.
- Le signataire `done` doit avoir `can_sign_off: true` dans le registre.
- **Personne** ne promeut une modification des fichiers de recette
  (`harness/run_h00.py`, `verify_gate.py`, `COORDINATION_MULTI_HARNESS/*.schema.json`,
  `verifier_coordination.py`) depuis une branche candidate : seul le **lead**
  (`corneil333`) le fait, et uniquement via le **job de confiance** (H20).

## 3. Branches

- Une branche par lot réservé : `lot/C08-<harness_id>`.
- `master`/`main` = intégré, **protégé** (protection à activer au lot C28).
- Toujours `git pull --rebase` **avant** de réserver un lot (évite les réserves
  fantômes / doubles revendications).

## 4. Preuves

- La preuve d'un lot = `docs/PREUVES_Cxx.md` **ou** un SHA de run H00/CI consigné
  dans `evidence_ref`. Un `done` sans `evidence_ref` est invalide.
- Un rapport généré par un agent est une **proposition** de preuve : il ne vaut
  `done` qu'après confirmation par la CI **et** un relecteur distinct.
- Aucune preuve de verrou/RLS/reprise n'est affirmée sans exécution réelle sur
  PostgreSQL : défaut d'infra ⇒ statut **blocked** honnête, jamais un PASS simulé.

## 5. Signatures

- En local (pré-C28) : le préfixe d'auteur + le `signature` des messages font foi
  de façon **déclarative**.
- Dès que le dépôt a un remote protégé : activer la **signature de commits**
  (SSH/GPG) et lier chaque `identity_key` du registre à la clé vérifiée par
  GitHub. Le `verifier_coordination.py` passe alors d'un contrôle déclaratif à un
  contrôle **authentifié**, sans changer sa logique.
