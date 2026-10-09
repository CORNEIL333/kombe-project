import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/design/kombe_tokens.g.dart';
import '../../core/formatters/labels.dart';
import '../../core/state/resource.dart';
import '../../core/widgets/kombe_visuals.dart';
import '../../core/widgets/screen_states.dart';
import '../../domain/entities/group.dart';
import '../../domain/entities/notification.dart';
import '../../domain/entities/profile.dart';
import '../../domain/repositories/group_repository.dart';
import '../../domain/repositories/notification_repository.dart';
import '../../domain/repositories/profile_repository.dart';
import 'profile_view_model.dart';

/// Profil & notifications (maquette « Compte, sécurité et paramètres »).
class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  ProfileViewModel? _vm;
  Future<Resource<List<GroupSummary>>>? _groups;
  Future<Resource<List<KombeNotification>>>? _notifications;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_vm == null) {
      _vm = ProfileViewModel(context.read<ProfileRepository>())..load();
      _groups = context.read<GroupRepository>().listGroups();
      _notifications = context.read<NotificationRepository>().listNotifications();
    }
  }

  @override
  void dispose() {
    _vm?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(centerTitle: true, title: const Text('Mon profil')),
        body: ListenableBuilder(
          listenable: _vm!,
          builder: (BuildContext context, Widget? child) => ResourceView<UserProfile>(
            resource: _vm!.state,
            builder: (BuildContext context, UserProfile profile) => ListView(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 100),
              children: <Widget>[
                _Header(profile: profile),
                const SizedBox(height: 16),
                FutureBuilder<Resource<List<GroupSummary>>>(
                  future: _groups,
                  builder: (BuildContext context, AsyncSnapshot<Resource<List<GroupSummary>>> snap) {
                    final List<GroupSummary>? groups = switch (snap.data) {
                      ResourceReady<List<GroupSummary>>(:final List<GroupSummary> data) => data,
                      _ => null,
                    };
                    return Row(
                      children: <Widget>[
                        Expanded(
                          child: _StatTile(
                            icon: Icons.groups_rounded,
                            iconColor: KombeColors.emerald,
                            label: 'Mon rôle',
                            value: groups == null || groups.isEmpty ? '—' : KombeLabels.role(groups.first.role),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: _StatTile(
                            icon: Icons.bar_chart_rounded,
                            iconColor: KombeColors.goldDark,
                            label: 'Mes groupes',
                            value: groups == null ? '—' : '${groups.length}',
                          ),
                        ),
                      ],
                    );
                  },
                ),
                const _SectionTitle('Sécurité du compte'),
                _Card(children: <Widget>[
                  _Row(icon: Icons.fingerprint_rounded, title: 'Authentification biométrique', subtitle: 'Connectez-vous avec votre empreinte',
                      onTap: () => context.push('/app/settings/security')),
                  _Row(icon: Icons.shield_rounded, iconColor: KombeColors.goldDark, title: 'Sécurité et confidentialité', subtitle: 'Gérer mes informations',
                      onTap: () => context.push('/app/settings/privacy'), last: true),
                ]),
                const _SectionTitle('Préférences'),
                _Card(children: <Widget>[
                  _Row(icon: Icons.language_rounded, title: 'Langue', trailing: profile.localeCode == 'en' ? 'English' : 'Français',
                      onTap: () => context.push('/app/settings/language')),
                  _Row(icon: Icons.notifications_none_rounded, title: 'Notifications', subtitle: 'Gérer mes alertes',
                      onTap: () => context.push('/app/settings/notifications'), last: true),
                ]),
                const _SectionTitle('Aide & support'),
                _Card(children: <Widget>[
                  _Row(icon: Icons.help_outline_rounded, title: 'Centre d’aide', subtitle: 'FAQ et guides d’utilisation', onTap: () => context.push('/app/help')),
                  _Row(icon: Icons.headset_mic_outlined, title: 'Nous contacter', subtitle: 'Assistance', onTap: () => context.push('/app/support'), last: true),
                ]),
                FutureBuilder<Resource<List<KombeNotification>>>(
                  future: _notifications,
                  builder: (BuildContext context, AsyncSnapshot<Resource<List<KombeNotification>>> snap) {
                    final List<KombeNotification> items = switch (snap.data) {
                      ResourceReady<List<KombeNotification>>(:final List<KombeNotification> data) => data.take(3).toList(),
                      _ => const <KombeNotification>[],
                    };
                    if (items.isEmpty) return const SizedBox.shrink();
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Row(children: <Widget>[
                          const Expanded(child: _SectionTitle('Notifications récentes')),
                          TextButton(
                            onPressed: () => context.go('/app/notifications'),
                            style: TextButton.styleFrom(foregroundColor: KombeColors.goldDark),
                            child: const Text('Voir tout'),
                          ),
                        ]),
                        for (final KombeNotification n in items)
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: 8),
                            child: Row(
                              children: <Widget>[
                                const Icon(Icons.campaign_outlined, color: KombeColors.forest),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: <Widget>[
                                      Text(n.title, style: Theme.of(context).textTheme.titleSmall),
                                      if (n.body.isNotEmpty) Text(n.body, style: Theme.of(context).textTheme.bodySmall),
                                    ],
                                  ),
                                ),
                                if (!n.read)
                                  Container(width: 8, height: 8, decoration: const BoxDecoration(color: KombeColors.forest, shape: BoxShape.circle)),
                              ],
                            ),
                          ),
                      ],
                    );
                  },
                ),
              ],
            ),
          ),
        ),
      );
}

class _Header extends StatelessWidget {
  const _Header({required this.profile});
  final UserProfile profile;

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    final String first = profile.displayName.trim().split(RegExp(r'\s+')).first;
    return Row(
      children: <Widget>[
        KombeAvatar(name: profile.displayName, url: profile.avatarUrl, size: 84),
        const SizedBox(width: 16),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text('Bonjour $first 👋', style: t.titleLarge?.copyWith(fontSize: 21)),
              const SizedBox(height: 4),
              Text(profile.displayName, style: t.bodyMedium),
              Text(profile.phoneE164, style: t.bodyMedium),
            ],
          ),
        ),
        Material(
          color: Colors.white,
          shape: const CircleBorder(),
          child: IconButton(
            tooltip: 'Modifier le profil',
            onPressed: () => context.push('/app/profile/edit'),
            icon: const Icon(Icons.edit_outlined, color: KombeColors.ink),
          ),
        ),
      ],
    );
  }
}

class _StatTile extends StatelessWidget {
  const _StatTile({required this.icon, required this.iconColor, required this.label, required this.value});
  final IconData icon;
  final Color iconColor;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: KombeTokens.sand100, borderRadius: BorderRadius.circular(18)),
      child: Row(
        children: <Widget>[
          Icon(icon, color: iconColor, size: 30),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(label, style: t.bodySmall),
                Text(value, maxLines: 1, overflow: TextOverflow.ellipsis, style: t.titleMedium),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 22, bottom: 8),
        child: Text(text, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontSize: 17)),
      );
}

class _Card extends StatelessWidget {
  const _Card({required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 14),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(18), border: Border.all(color: KombeColors.line)),
        child: Column(children: children),
      );
}

class _Row extends StatelessWidget {
  const _Row({required this.icon, required this.title, required this.onTap, this.subtitle, this.trailing, this.iconColor, this.last = false});
  final IconData icon;
  final String title;
  final String? subtitle;
  final String? trailing;
  final Color? iconColor;
  final VoidCallback onTap;
  final bool last;

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    return InkWell(
      onTap: onTap,
      child: Container(
        constraints: const BoxConstraints(minHeight: 60),
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(border: last ? null : const Border(bottom: BorderSide(color: KombeColors.line))),
        child: Row(
          children: <Widget>[
            Icon(icon, color: iconColor ?? KombeColors.ink),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(title, style: t.titleSmall?.copyWith(fontWeight: FontWeight.w600, fontSize: 15)),
                  if (subtitle != null) Text(subtitle!, style: t.bodySmall),
                ],
              ),
            ),
            if (trailing != null) ...<Widget>[Text(trailing!, style: t.bodyMedium), const SizedBox(width: 6)],
            const Icon(Icons.chevron_right_rounded, color: KombeColors.slate),
          ],
        ),
      ),
    );
  }
}
