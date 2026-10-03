# ADR-0020 — Client mobile Flutter natif

- **Statut :** ADOPTÉ — décision humaine du 30/09/2026
- **Décision remplacée :** `OPEN-D03` de `STACK.md`
- **Portée :** client mobile KÓMBE Android/iOS

## Décision

KÓMBE adopte **Flutter** pour son client mobile natif. Le client Flutter est distinct du client web/PWA `packages/client`.

Le backend TypeScript/PostgreSQL reste la source de vérité. Le client mobile n'implémente aucune règle financière comme autorité locale.

## Architecture

Le client suit la séparation recommandée par Flutter :

1. **UI** : Views + ViewModels ;
2. **Domain** : entités immuables et contrats de repositories ;
3. **Data** : adapters locaux et distants ;
4. **Services plateforme** : stockage sécurisé, biométrie, fichiers.

Les flux suivent unidirectional data flow. Les repositories sont injectés ; aucun singleton métier global n'est exposé.

## Règles de données

- aucune donnée métier embarquée ou seedée ;
- aucune donnée réelle introduite avant la porte projet qui l'autorise ;
- seuls les brouillons explicitement saisis par l'utilisateur peuvent être conservés hors ligne ;
- les brouillons restent distincts des commandes acceptées ;
- aucune validation, vote, rôle, règle ou confirmation de décaissement n'est créée localement ;
- aucun PIN n'est stocké en clair ;
- les futurs tokens/session opaques utilisent le stockage sécurisé natif.

## Accessibilité et sécurité

Cible de conception : WCAG 2.2 A/AA applicable au mobile, guidance W3C WCAG2Mobile, et contrôles OWASP MASVS pertinents. Toute assertion de conformité finale exige une vérification réelle ; cet ADR ne constitue pas une certification.
