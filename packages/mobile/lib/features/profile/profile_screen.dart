import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/formatters/labels.dart';
import '../../core/state/resource.dart';
import '../../core/widgets/kombe_sign_out.dart';
import '../../core/widgets/group_avatar.dart';
import '../../l10n/app_localizations.dart';
import '../groups/group_photo_sheet.dart';
import '../../core/widgets/screen_states.dart';
import '../../domain/entities/group.dart';
import '../../domain/entities/notification.dart';
import '../../domain/entities/profile.dart';
import '../../domain/repositories/group_repository.dart';
import '../../domain/repositories/notification_repository.dart';
import '../../domain/repositories/profile_repository.dart';
import '../notifications/notification_actions.dart';
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
        appBar: AppBar(title: Text(AppLocalizations.of(context).profile)),
        body: ListenableBuilder(
          listenable: _vm!,
          builder: (BuildContext context, Widget? child) => ResourceView<UserProfile>(
            resource: _vm!.state,
            builder: (BuildContext context, UserProfile profile) => ListView(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 100),
              children: <Widget>[
                _Header(profile: profile, onPhotoChanged: () async => _vm!.load()),
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
                            label: AppLocalizations.of(context).myRole,
                            value: groups == null || groups.isEmpty ? '—' : _roleOf(groups.first),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: _StatTile(
                            icon: Icons.bar_chart_rounded,
                            iconColor: KombeColors.goldDark,
                            label: AppLocalizations.of(context).myGroups,
                            value: groups == null ? '—' : '${groups.length}',
                          ),
                        ),
                      ],
                    );
                  },
                ),
                _SectionTitle(AppLocalizations.of(context).accountSecurity),
                _Card(children: <Widget>[
                  _Row(icon: Icons.password_rounded, title: AppLocalizations.of(context).loginAndSession, subtitle: AppLocalizations.of(context).loginAndSessionSub,
                      onTap: () => context.push('/app/settings/security')),
                  _Row(icon: Icons.shield_rounded, iconColor: KombeColors.goldDark, title: AppLocalizations.of(context).securityPrivacy, subtitle: AppLocalizations.of(context).manageMyInfo,
                      onTap: () => context.push('/app/settings/privacy'), last: true),
                ]),
                _SectionTitle(AppLocalizations.of(context).preferences),
                _Card(children: <Widget>[
                  _Row(icon: Icons.language_rounded, title: AppLocalizations.of(context).language, trailing: profile.localeCode == 'en' ? 'English' : 'Français',
                      onTap: () => context.push('/app/settings/language')),
                  _Row(icon: Icons.notifications_none_rounded, title: AppLocalizations.of(context).notifications, subtitle: AppLocalizations.of(context).notificationsSub,
                      onTap: () => context.push('/app/settings/notifications'), last: true),
                ]),
                _SectionTitle(AppLocalizations.of(context).helpAndSupport),
                _Card(children: <Widget>[
                  _Row(icon: Icons.help_outline_rounded, title: AppLocalizations.of(context).helpCenterTitle, subtitle: AppLocalizations.of(context).helpCenterSub, onTap: () => context.push('/app/help')),
                  _Row(icon: Icons.headset_mic_outlined, title: AppLocalizations.of(context).contactSupport, subtitle: AppLocalizations.of(context).assistance, onTap: () => context.push('/app/support')),
                  _Row(icon: Icons.cloud_off_outlined, title: AppLocalizations.of(context).offlineTitle, subtitle: AppLocalizations.of(context).offlineSub, onTap: () => context.push('/app/offline')),
                  _Row(icon: Icons.info_outline_rounded, title: AppLocalizations.of(context).aboutAndUpdate, subtitle: AppLocalizations.of(context).aboutAndUpdateSub,
                      onTap: () => context.push('/app/about'), last: true),
                ]),
                const SizedBox(height: 22),
                const KombeBoutonDeconnexion(),
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
                          Expanded(child: _SectionTitle(AppLocalizations.of(context).recentNotifications)),
                          IconButton(
                            tooltip: AppLocalizations.of(context).seeAll,
                            onPressed: () => context.go('/app/notifications'),
                            icon: const Icon(Icons.arrow_forward_rounded, color: KombeColors.goldDark),
                          ),
                        ]),
                        for (final KombeNotification n in items)
                          InkWell(
                            onTap: () => openNotification(context, n),
                            child: Padding(
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
  const _Header({required this.profile, required this.onPhotoChanged});
  final UserProfile profile;
  final Future<void> Function() onPhotoChanged;

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    final String first = profile.displayName.trim().split(RegExp(r'\s+')).first;
    return Row(
      children: <Widget>[
        Stack(
          clipBehavior: Clip.none,
          children: <Widget>[
            MyAvatar(name: profile.displayName, photoVersion: profile.photoVersion, size: 84),
            Positioned(
              right: -6,
              bottom: -6,
              child: Material(
                color: KombeColors.goldWarm,
                shape: const CircleBorder(side: BorderSide(color: KombeColors.cream, width: 2)),
                child: IconButton(
                  tooltip: profile.photoVersion == null ? AppLocalizations.of(context).addMyPhoto : AppLocalizations.of(context).changeMyPhoto,
                  visualDensity: VisualDensity.compact,
                  onPressed: () => showMyPhotoSheet(context, name: profile.displayName, photoVersion: profile.photoVersion, afterChange: onPhotoChanged),
                  icon: const Icon(Icons.photo_camera_outlined, size: 18, color: KombeColors.ink),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(width: 16),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(AppLocalizations.of(context).dashHelloName(first), style: t.headlineSmall),
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
            tooltip: AppLocalizations.of(context).editProfile,
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
      decoration: BoxDecoration(color: KombeColors.sand, borderRadius: BorderRadius.circular(18)),
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
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(color: (iconColor ?? KombeColors.forest).withValues(alpha: .1), borderRadius: BorderRadius.circular(12)),
              child: Icon(icon, size: 20, color: iconColor ?? KombeColors.forest),
            ),
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

String _roleOf(GroupSummary g) =>
    g.apiRoles.isEmpty ? KombeLabels.role(g.role) : g.apiRoles.map(apiRoleLabel).join(', ');
