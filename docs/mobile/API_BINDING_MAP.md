# Carte de raccordement API

Ce fichier décrit **où** brancher le backend sans inventer des endpoints non présents dans le contrat OpenAPI du dépôt principal.

| Domaine mobile | Port à implémenter | Données attendues |
|---|---|---|
| Session | `AuthRepository` | session, récupération, vérification, logout |
| Profil | `ProfileRepository` | profil, PIN |
| Dashboard | `DashboardRepository` | agrégat autorisé pour l'accueil |
| Groupes | `GroupRepository` | groupes, membres, cycles, règles, invitations |
| Cotisations | `ContributionRepository` | historique, détail, soumission idempotente |
| Validation / vote | `GovernanceRepository` | file de validation, décisions, votes |
| Litiges | `DisputeRepository` | dossiers, timeline, ouverture |
| Notifications | `NotificationRepository` | centre de notifications |
| Documents | `DocumentRepository` | documents et exports filtrés |

## Règle d'intégration

1. lire `docs/openapi.yaml` du dépôt KÓMBE ;
2. créer un service HTTP par frontière externe ;
3. mapper les DTO API vers les entités domain mobiles ;
4. ne jamais exposer le client HTTP directement à une View ;
5. appliquer les erreurs stables du serveur ;
6. conserver la clé d'idempotence d'une commande jusqu'à résultat certain ;
7. revalider permissions/règles côté serveur au retour réseau ;
8. ajouter des tests contractuels contre l'OpenAPI réel.

Les routes, payloads et codes HTTP non présents dans le contrat serveur ne doivent pas être devinés par le client.
