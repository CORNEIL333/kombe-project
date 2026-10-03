import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/widgets/list_row.dart';
import '../../core/widgets/screen_states.dart';
import '../../core/widgets/section_card.dart';
import '../../domain/entities/profile.dart';
import '../../domain/repositories/profile_repository.dart';
import 'profile_view_model.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  ProfileViewModel? _vm;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _vm ??= ProfileViewModel(context.read<ProfileRepository>())..load();
  }

  @override
  void dispose() {
    _vm?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Mon profil')),
        body: ListenableBuilder(
          listenable: _vm!,
          builder: (BuildContext context, Widget? child) => ResourceView<UserProfile>(
            resource: _vm!.state,
            builder: (BuildContext context, UserProfile profile) => ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 100),
              children: <Widget>[
                Row(
                  children: <Widget>[
                    const CircleAvatar(
                      radius: 36,
                      backgroundColor: KombeColors.mint,
                      foregroundColor: KombeColors.forest,
                      child: Icon(Icons.person, size: 36),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          Text(
                            profile.displayName,
                            style: Theme.of(context).textTheme.titleLarge,
                          ),
                          const SizedBox(height: 4),
                          Text(profile.phoneE164),
                        ],
                      ),
                    ),
                    IconButton(
                      tooltip: 'Modifier',
                      onPressed: () => context.push('/app/profile/edit'),
                      icon: const Icon(Icons.edit_outlined),
                    ),
                  ],
                ),
                const SizedBox(height: 24),
                Text('Sécurité du compte', style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 8),
                SectionCard(
                  child: Column(
                    children: <Widget>[
                      KombeListRow(
                        icon: Icons.lock_outline,
                        title: 'Code PIN',
                        subtitle: 'Modifier mon code PIN',
                        onTap: () => context.push('/app/settings/change-pin'),
                      ),
                      const Divider(),
                      KombeListRow(
                        icon: Icons.fingerprint,
                        title: 'Authentification biométrique',
                        onTap: () => context.push('/app/settings/security'),
                      ),
                      const Divider(),
                      KombeListRow(
                        icon: Icons.shield_outlined,
                        title: 'Sécurité et confidentialité',
                        onTap: () => context.push('/app/settings/privacy'),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 20),
                Text('Préférences', style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 8),
                SectionCard(
                  child: Column(
                    children: <Widget>[
                      KombeListRow(
                        icon: Icons.language,
                        title: 'Langue',
                        trailing: Text(profile.localeCode.toUpperCase()),
                        onTap: () => context.push('/app/settings/language'),
                      ),
                      const Divider(),
                      KombeListRow(
                        icon: Icons.notifications_none,
                        title: 'Notifications',
                        onTap: () => context.push('/app/settings/notifications'),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 20),
                Text('Aide & support', style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 8),
                SectionCard(
                  child: Column(
                    children: <Widget>[
                      KombeListRow(
                        icon: Icons.help_outline,
                        title: 'Centre d’aide',
                        onTap: () => context.push('/app/help'),
                      ),
                      const Divider(),
                      KombeListRow(
                        icon: Icons.support_agent_outlined,
                        title: 'Nous contacter',
                        onTap: () => context.push('/app/support'),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      );
}
