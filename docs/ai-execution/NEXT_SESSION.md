# Reprise

1. `cd C:\Users\migco\Desktop\kombe-immersif` puis `git switch refonte/premium-photos && git status`.
2. Lire `MISSION.md`, `STATE.json` (champ `next`), `WORKLOG.md`.
3. Vérifier : `pnpm -C packages/domain test`, `pnpm -C packages/api test`, `pnpm -C packages/client test`, `cd packages/mobile && flutter analyze && flutter test`.
4. Reprendre au premier élément de `remaining`. Ne pas toucher l'écran de connexion PWA. Aucun déploiement, aucun téléchargement.
Aucun ordonnanceur de reprise automatique n'est configuré (GitHub Actions bloqué par la facturation).
