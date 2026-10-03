# Architecture mobile KÓMBE

## Principes

Le client mobile est une **projection interactive** du système KÓMBE. Il ne remplace jamais l'API, PostgreSQL, le journal ni les contrôles d'autorisation serveur.

```text
Flutter View
   ↓ events
ViewModel / command
   ↓
Repository interface
   ├── Local adapter (préférences + brouillons autorisés)
   └── Remote adapter (à raccorder à l'API KÓMBE)
          ↓
       API Fastify
          ↓
      PostgreSQL / RLS
```

## Couche UI

Les écrans sont composés autour d'un design system KÓMBE :

- `KombeColors`, `KombeTheme`, `KombeSpacing`
- `KombeLogo`, `AfricanPatternBand`
- cartes de section, états loading/empty/error/unavailable
- minimum de cible tactile 48 dp
- aucune information critique véhiculée uniquement par couleur
- support du texte agrandi sans hauteur fixe sur les contenus métier

## Couche Domain

Les entités mobiles sont immuables. Aucun modèle UI ne devient source de vérité financière.

Repositories principaux :

- `AuthRepository`
- `ProfileRepository`
- `DashboardRepository`
- `GroupRepository`
- `ContributionRepository`
- `GovernanceRepository`
- `DisputeRepository`
- `NotificationRepository`
- `DocumentRepository`
- `ContributionDraftRepository`
- `PreferencesRepository`

## Couche Data

Le build livré ici utilise des repositories `Unavailable*` pour les services distants. Ils retournent **indisponible/bloqué**, jamais une réussite ni des données fabriquées.

SQLite contient uniquement `contribution_draft`. Le schéma ne contient ni membres, ni groupes, ni votes, ni règles, ni validations, ni soldes.

## Offline

Autorisé hors connexion :

- préférences UI ;
- brouillon de cotisation initié par l'utilisateur ;
- future lecture d'un cache whitelisté après implémentation C15 et politique TTL.

Interdit hors connexion :

- validation d'une cotisation ;
- vote ;
- changement de rôle ;
- publication de règles ;
- confirmation de décaissement ;
- toute opération qui prétend modifier la vérité serveur.

## Security baseline

- secure storage réservé au matériel de session opaque ;
- aucune persistance du PIN ;
- biométrie fournie par l'OS ;
- aucune URL de support ni secret codé en dur ;
- aucune donnée métier seedée ;
- chemins négatifs explicitement représentés ;
- deep links devront être validés avant traitement lorsque l'adapter remote sera ajouté.

## Références d'architecture

- Flutter App Architecture Guide : https://docs.flutter.dev/app-architecture/guide
- Flutter Architecture Recommendations : https://docs.flutter.dev/app-architecture/recommendations
- OWASP MASVS : https://mas.owasp.org/MASVS/
- W3C WCAG2Mobile : https://www.w3.org/TR/wcag2mobile-22/
