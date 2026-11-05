# Inventaire de couverture UI — KÓMBE (refonte « Cercle & Ndop »)

Statuts : **FAIT** (refait et vérifié en capture), **THÈME** (hérite du nouveau thème, non retravaillé), **À FAIRE**, **WEB** (fonction ouverte dans KÓMBE Web depuis le mobile). Mis à jour à chaque lot.

## Flutter (38 routes)

| Route | Fichier (`packages/mobile/lib/features/`) | Famille | Statut | Notes |
|---|---|---|---|---|
| `/` | auth/welcome_screen.dart | onboarding | THÈME | écran le plus abouti |
| `/login` | auth/login_screen.dart | connexion | INTOUCHABLE | maquette « Connectez-vous » conservée |
| `/register` | auth/register_screen.dart | inscription | FAIT | capture du tour vérifiée |
| `/verify-code` | auth/verify_code_screen.dart | inscription | FAIT | capture du tour vérifiée |
| `/recovery-request` | auth/recovery_request_screen.dart | récupération | FAIT | capture du tour vérifiée |
| `/server-required` | offline/server_required_screen.dart | erreurs | FAIT | capture du tour vérifiée |
| coquille | app/router/main_shell.dart | navigation | FAIT | 4 onglets, Ndop dans le menu |
| `/app` | home/dashboard_*.dart | accueil | FAIT | héros forêt, anneau du cycle, raccourcis |
| `/app/contributions` | contributions/contribution_history_screen.dart | cotisations | FAIT | capture du tour vérifiée |
| `/app/groups` | groups/my_groups_screen.dart | groupes | THÈME | |
| `/app/notifications` | notifications/notifications_screen.dart | activité | THÈME | |
| `/app/bureau`, `…/:id/bureau` | groups/bureau_screen.dart | bureau | FAIT | capture du tour vérifiée |
| `/app/groups/join` | groups/join_group_screen.dart | adhésion | FAIT | capture du tour vérifiée |
| `/app/groups/create` | groups/create_group_screen.dart | création | FAIT | capture du tour vérifiée |
| `/app/groups/:id` | groups/group_detail_screen.dart | groupe | FAIT | capture du tour vérifiée |
| `…/members` | groups/members_screen.dart | membres | FAIT | bureau/membres, avatars teintés, recherche |
| `…/members/:id` | groups/member_detail_screen.dart | membres | FAIT | capture du tour vérifiée |
| `…/cycle` | groups/cycle_screen.dart | cycles | FAIT | capture du tour vérifiée |
| `…/beneficiaries` | groups/beneficiaries_screen.dart | remises | FAIT | capture du tour vérifiée |
| `…/funds` | groups/funds_screen.dart | caisses | FAIT | capture du tour vérifiée |
| `…/rules` | groups/rules_screen.dart | statuts | FAIT | capture du tour vérifiée |
| `…/invite` | groups/invite_member_screen.dart | invitations | FAIT | capture du tour vérifiée |
| `…/settings` | groups/group_settings_screen.dart | bureau | THÈME | |
| feuille photo | groups/group_photo_sheet.dart | identité | THÈME | |
| `…/contributions/new` | contributions/contribution_start_screen.dart | cotisations | FAIT | capture du tour vérifiée |
| feuille envoyée | contributions/contribution_sent_sheet.dart | confirmations | FAIT | capture du tour vérifiée |
| `/app/contributions/:id` | contributions/contribution_detail_screen.dart | cotisations | FAIT | capture du tour vérifiée |
| `/app/validations`, `/:id` | validation/validation_screens.dart | validation | FAIT | capture du tour vérifiée |
| `/app/votes`, `/:id` | governance/vote_screens.dart | votes | FAIT | capture du tour vérifiée |
| `/app/profile`, `/edit` | profile/*.dart | profil | FAIT | capture du tour vérifiée |
| `/app/settings/*` (4) | settings/*.dart | réglages | THÈME | |
| `/app/documents` | documents/document_screens.dart | documents | FAIT | capture du tour vérifiée |
| `/app/help`, `/app/support` | support/support_screens.dart | assistance | THÈME | |
| `/app/offline` | offline/offline_status_screen.dart | hors ligne | FAIT | capture du tour vérifiée |
| `/app/about` | settings/about_screen.dart | réglages | THÈME | |
| séances, amendes, secours, ouverture de vote, journal | — | — | WEB | pas d'écran natif (ouvre KÓMBE Web) |

## PWA

| Surface | Fichier (`packages/client/src/`) | Statut |
|---|---|---|
| Connexion / inscription | tontine/Connexion.tsx | INTOUCHABLE (connexion) |
| Coquille, Accueil, Notifications, cloche, Mes groupes, photo | App.tsx, tontine/{Coquille,Accueil,ApercuNonLues,MesGroupes,PhotoGroupe}.tsx | refaits au lot précédent ; à harmoniser |
| Groupe (10 onglets), Création, Rejoindre, Membres, Séances, Argent, Caisses, Tours, Discipline, Décisions, Statuts, Journal, Réglages | tontine/*.tsx | À FAIRE — couche CSS historique (`liste`, `bouton-compact`, `tcarte`) |
| Profil, Mes cotisations, Validations, Documents, Aide | tontine/*.tsx | À FAIRE |

Dette de jetons PWA : six systèmes superposés (`--k-*`, `--couleur-*`, `--c-*`, `--p-*`, `--cx-*`, `--rayon-*` contradictoires) — trois ors différents.
