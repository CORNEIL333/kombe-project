# ADR-0003 — Canonicalisation JSON via RFC 8785 (JCS), bibliothèque épinglée

- **Statut :** ADOPTÉ (C00)
- **Auteur :** Lead technique C00 • **Date :** 2026-09-27
- **Contexte / origine :** `ARCHITECTURE_CIBLE.md` §Journal et preuves — **avertissement
  explicite** : ne pas réimplémenter JCS par un simple tri de clés.

## Décision
- Le hash d'événement et toute preuve d'intégrité reposent sur la forme canonique
  **RFC 8785 (JSON Canonicalization Scheme)**, déléguée à la bibliothèque
  **`canonicalize@2.1.0`**, épinglée par version dans le lockfile.
- **Profil KÓMBE** appliqué avant canonicalisation (`toJcsValue`) :
  - bigint → entier sûr (sinon refus `CANONICAL_HORS_ENTIER_SUR`) ;
  - **flottant interdit** dans le journal (refus, pas d'arrondi) ;
  - propriétés `undefined` **non sérialisées** (une clé absente ≠ clé à null) ;
  - réécriture récursive tableaux/objets.
- Hash = SHA-256 sur les **octets UTF-8** de la forme canonique (`sha256Hex`).

## Alternatives rejetées
- **Tri de clés manuel** `JSON.stringify` — non conforme à JCS (ordre UTF-16 des
  codes, échappements, nombres) → hashes non reproductibles entre moteurs.
- `canonical-json` / implémentations maison non testées contre les vecteurs officiels.
- Canoniser en SQL (`jsonb`) — `jsonb` **n'est pas** canonique (il perd l'ordre et
  normalise les nombres) : interdit comme source de hash.

## Conséquences
- La dépendance de canonicalisation est **épinglée** ; une montée de version
  suppose de rejouer les vecteurs JCS officiels et les tests du journal.
- Toute future projection/preuve réutilise `canonicalHash` — jamais un `stringify` brut.
