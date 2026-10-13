# ADR-0027 — Calendrier réel des séances

- **Statut :** **PROPOSÉ, appliqué par défaut** — remplace la dérivation hebdomadaire par quantième d'ADR-0015 (I-11).
- **Date :** 2026-10-13
- **Auteur :** harnais `claude-code` (prompt maître « KÓMBE, tontine réelle »)

## Contexte

Une tontine se réunit « chaque dimanche », « le 2e samedi », « tous les 8 jours » (semaine traditionnelle), pas « le 14 de chaque semaine ».

## Décision

- Six rythmes : `daily` (jours exclus), `every_n_days` (2 à 31), `weekly` et `biweekly` (jour de semaine), `monthly_day` (quantième, borné au dernier jour du mois), `monthly_nth_weekday` (1er…4e ou dernier).
- Première séance = première date conforme à partir de la date choisie (même règle côté PWA pour l'affichage). Heure limite de cotisation en heure de Douala (UTC+1, sans heure d'été).
- Migration des anciennes règles : `legacyCadence()`.
- Pause d'un tour : paramètre `paused` du calcul des dates prêt dans le domaine ; parcours de vote à brancher.

## Conséquences

Le calendrier est figé au démarrage du cycle ; seuls un échange de tour accepté ou une pause votée le modifient.
