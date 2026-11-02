# Journal d'exécution — refonte premium

## 2026-11-01/02 — Lot A : photo de tontine (serveur)
- Pack fourni constaté : seul `KOMBE_6_fonds_individuels.zip` (6 fonds PNG) existe ; `KOMBE_UI_PREMIUM_CLAUDE_PACK` (SVG, design_tokens.json, avatars) est ABSENT → tokens dérivés de la charte visuelle fournie en image.
- Décision stockage : aucun stockage objet configuré dans le projet ; en ajouter un = compte, clés et coûts (décision du titulaire). Choix réversible : variantes JPEG carrées 512/256 normalisées (≤ 400/150 Ko) en `bytea`, table `group_photo` (migration 0034, RLS par groupe, pas de DELETE applicatif). Migration de sortie vers un stockage objet = recopier les octets, garder `version`.
- Pas de bibliothèque d'image côté serveur (aucun téléchargement autorisé) : les clients recadrent/ré-encodent ; le serveur valide la structure JPEG, lit les dimensions réelles (SOF), borne la taille, retire APP1–13/15 et COM (EXIF/GPS), refuse PNG/SVG/tronqué/malformé.
- Droits : action `group.photo` = présidence + secrétariat ; lecture = membres ; aperçu via code d'invitation valide ; 6 changements/heure/groupe ; journal `tontine.photo_changed|removed` (empreinte, sans octets).
- Routes : GET/PUT/DELETE `/v1/tontines/:id/photo`, GET `/v1/invitations/:code/photo` (ETag = version, `private`). `photoVersion` ajouté (optionnel) aux résumés et au détail.
- Tests : domaine 444 (dont 5 photo : EXIF/GPS retirés, dimensions réelles, PNG/SVG/vide/tronqué/lourd/malformé refusés, droits), API 249 (contrat OpenAPI ↔ routes).
- Non fait : preuve sur PostgreSQL réel (aucune base isolée) → BLOCKED.
