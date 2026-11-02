# Inventaire de couverture UI — KÓMBE (refonte « Cercle & Ndop »)

Statuts : **FAIT** (refait et vérifié en capture), **THÈME** (hérite du nouveau thème, non retravaillé), **À FAIRE**, **WEB** (fonction ouverte dans KÓMBE Web depuis le mobile). Mis à jour à chaque lot.

## Flutter (38 routes)

| Route | Fichier (`packages/mobile/lib/features/`) | Famille | Statut | Notes |
|---|---|---|---|---|
| `/` | auth/welcome_screen.dart | onboarding | THÈME | écran le plus abouti |
| `/login` | auth/login_screen.dart | connexion | INTOUCHABLE | maquette « Connectez-vous » conservée |
| `/register` | auth/register_screen.dart | inscription | À FAIRE | formulaire générique |
| `/verify-code` | auth/verify_code_screen.dart | inscription | À FAIRE | |
| `/recovery-request` | auth/recovery_request_screen.dart | récupération | À FAIRE | titre doublé |
| `/server-required` | offline/server_required_screen.dart | erreurs | À FAIRE | |
| coquille | app/router/main_shell.dart | navigation | FAIT | 4 onglets, Ndop dans le menu |
| `/app` | home/dashboard_*.dart | accueil | FAIT | héros forêt, anneau du cycle, raccourcis |
| `/app/contributions` | contributions/contribution_history_screen.dart | cotisations | À FAIRE | statuts en texte brut |
| `/app/groups` | groups/my_groups_screen.dart | groupes | THÈME | |
| `/app/notifications` | notifications/notifications_screen.dart | activité | THÈME | |
| `/app/bureau`, `…/:id/bureau` | groups/bureau_screen.dart | bureau | À FAIRE | liste type réglages, spinner sans erreur |
| `/app/groups/join` | groups/join_group_screen.dart | adhésion | À FAIRE | pas d'état d'envoi |
| `/app/groups/create` | groups/create_group_screen.dart | création | À FAIRE | bleu hors palette |
| `/app/groups/:id` | groups/group_detail_screen.dart | groupe | À FAIRE | |
| `…/members` | groups/members_screen.dart | membres | FAIT | bureau/membres, avatars teintés, recherche |
| `…/members/:id` | groups/member_detail_screen.dart | membres | À FAIRE | |
| `…/cycle` | groups/cycle_screen.dart | cycles | À FAIRE | erreur sans « Réessayer » |
| `…/beneficiaries` | groups/beneficiaries_screen.dart | remises | À FAIRE | pas d'état vide |
| `…/funds` | groups/funds_screen.dart | caisses | À FAIRE | AlertDialog / sheet brute |
| `…/rules` | groups/rules_screen.dart | statuts | À FAIRE | |
| `…/invite` | groups/invite_member_screen.dart | invitations | À FAIRE | |
| `…/settings` | groups/group_settings_screen.dart | bureau | THÈME | |
| feuille photo | groups/group_photo_sheet.dart | identité | THÈME | |
| `…/contributions/new` | contributions/contribution_start_screen.dart | cotisations | À FAIRE | |
| feuille envoyée | contributions/contribution_sent_sheet.dart | confirmations | À FAIRE | |
| `/app/contributions/:id` | contributions/contribution_detail_screen.dart | cotisations | À FAIRE | |
| `/app/validations`, `/:id` | validation/validation_screens.dart | validation | À FAIRE | |
| `/app/votes`, `/:id` | governance/vote_screens.dart | votes | À FAIRE | |
| `/app/profile`, `/edit` | profile/*.dart | profil | THÈME | |
| `/app/settings/*` (4) | settings/*.dart | réglages | THÈME | |
| `/app/documents` | documents/document_screens.dart | documents | À FAIRE | |
| `/app/help`, `/app/support` | support/support_screens.dart | assistance | THÈME | |
| `/app/offline` | offline/offline_status_screen.dart | hors ligne | À FAIRE | `Colors.green/red` |
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
