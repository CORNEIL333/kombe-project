import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/design/kombe_spacing.dart';
import '../../core/design/kombe_tokens.g.dart';
import '../../core/formatters/xaf.dart';
import '../../core/widgets/group_hero_card.dart';
import '../../core/widgets/kombe_logo.dart';
import '../../core/widgets/kombe_visuals.dart';
import '../../domain/entities/dashboard.dart';
import '../../domain/entities/group.dart';
import '../../domain/entities/notification.dart';
import '../../l10n/app_localizations.dart';

/// Tableau de bord (maquette « Vue principale après connexion ») :
/// salutation → groupe principal → échéance et déclaré du mois → 4 actions →
/// activité récente. Toutes les valeurs viennent de [DashboardData].
class DashboardContent extends StatelessWidget {
  const DashboardContent({
    required this.data,
    required this.onRefresh,
    super.key,
    this.displayName,
    this.avatarUrl,
    this.now,
  });

  final DashboardData data;
  final Future<void> Function() onRefresh;
  final String? displayName;
  final Uri? avatarUrl;

  /// Horloge injectable (tests) ; défaut : maintenant.
  final DateTime? now;

  @override
  Widget build(BuildContext context) {
    final GroupSummary? group = data.primaryGroup;
    final int unread = data.recentActivity.where((KombeNotification n) => !n.read).length;
    return RefreshIndicator(
      onRefresh: onRefresh,
      color: KombeColors.emerald,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(KombeSpacing.screen, KombeSpacing.md, KombeSpacing.screen, 112),
        children: <Widget>[
          _Greeting(name: displayName, avatarUrl: avatarUrl, unread: unread),
          const SizedBox(height: 18),
          if (group == null)
            _NoGroup(onJoin: () => context.push('/app/groups/join'))
          else ...<Widget>[
            GroupHeroCard(
              group: group,
              eyebrow: 'Mon groupe principal',
              onTap: () => context.push('/app/groups/${group.id}'),
            ),
            const SizedBox(height: 14),
            IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: <Widget>[
                  Expanded(child: _NextDueCard(dueAtUtc: data.nextContributionAtUtc, now: now)),
                  const SizedBox(width: 12),
                  Expanded(child: _DeclaredCard(amountXaf: data.currentMonthDeclaredXaf, percent: data.progressPercent)),
                ],
              ),
            ),
            const SizedBox(height: 18),
            _QuickActions(groupId: group.id),
          ],
          const SizedBox(height: 26),
          Row(
            children: <Widget>[
              Expanded(child: Text('Activité récente', style: Theme.of(context).textTheme.titleLarge)),
              TextButton(
                onPressed: () => context.go('/app/notifications'),
                style: TextButton.styleFrom(foregroundColor: KombeColors.goldDark),
                child: const Text('Voir tout'),
              ),
            ],
          ),
          if (data.recentActivity.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 10),
              child: Text('L’historique de votre groupe apparaîtra ici.', style: Theme.of(context).textTheme.bodyMedium),
            )
          else
            for (final KombeNotification item in data.recentActivity) _ActivityRow(item: item, now: now),
        ],
      ),
    );
  }
}

class _Greeting extends StatelessWidget {
  const _Greeting({required this.name, required this.avatarUrl, required this.unread});
  final String? name;
  final Uri? avatarUrl;
  final int unread;

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    final String? first = name?.trim().split(RegExp(r'\s+')).first;
    return Row(
      children: <Widget>[
        if (first != null && first.isNotEmpty) ...<Widget>[
          KombeAvatar(name: name!, url: avatarUrl, size: 52),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text('Bonjour $first 👋', style: t.titleLarge?.copyWith(fontSize: 21)),
                const SizedBox(height: 2),
                Text('Ensemble, on va plus loin.', style: t.bodyMedium),
              ],
            ),
          ),
        ] else
          const Expanded(child: Align(alignment: Alignment.centerLeft, child: KombeLogo(size: 40))),
        _Bell(unread: unread),
      ],
    );
  }
}

class _Bell extends StatelessWidget {
  const _Bell({required this.unread});
  final int unread;

  @override
  Widget build(BuildContext context) => Semantics(
        button: true,
        label: unread == 0 ? 'Notifications' : 'Notifications, $unread non lues',
        child: ExcludeSemantics(
          child: InkResponse(
            onTap: () => context.go('/app/notifications'),
            radius: 28,
            child: Stack(
              clipBehavior: Clip.none,
              children: <Widget>[
                Container(
                  width: 48,
                  height: 48,
                  decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
                  child: const Icon(Icons.notifications_none_rounded, color: KombeColors.ink),
                ),
                if (unread > 0)
                  Positioned(
                    right: 2,
                    top: 0,
                    child: Container(
                      constraints: const BoxConstraints(minWidth: 19),
                      height: 19,
                      padding: const EdgeInsets.symmetric(horizontal: 5),
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: KombeColors.danger,
                        borderRadius: BorderRadius.circular(99),
                        border: Border.all(color: KombeColors.cream, width: 2),
                      ),
                      child: Text('$unread', style: const TextStyle(color: Colors.white, fontSize: 10.5, fontWeight: FontWeight.w800)),
                    ),
                  ),
              ],
            ),
          ),
        ),
      );
}

class _InfoCard extends StatelessWidget {
  const _InfoCard({required this.icon, required this.iconBg, required this.iconFg, required this.children});
  final IconData icon;
  final Color iconBg;
  final Color iconFg;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: KombeColors.line),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(color: iconBg, borderRadius: BorderRadius.circular(9)),
              child: Icon(icon, size: 19, color: iconFg),
            ),
            const SizedBox(height: 10),
            ...children,
          ],
        ),
      );
}

class _NextDueCard extends StatelessWidget {
  const _NextDueCard({required this.dueAtUtc, required this.now});
  final DateTime? dueAtUtc;
  final DateTime? now;

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    final String locale = Localizations.localeOf(context).toLanguageTag();
    final DateTime? due = dueAtUtc?.toLocal();
    final DateTime today = DateUtils.dateOnly(now ?? DateTime.now());
    final int? days = due == null ? null : DateUtils.dateOnly(due).difference(today).inDays;
    return _InfoCard(
      icon: Icons.calendar_month_rounded,
      iconBg: KombeTokens.gold100,
      iconFg: KombeTokens.gold700,
      children: <Widget>[
        Text('Prochaine cotisation', style: t.bodySmall),
        const SizedBox(height: 4),
        Text(due == null ? '—' : DateFormat.yMMMd(locale).format(due), style: t.titleMedium?.copyWith(fontSize: 17)),
        if (days != null) ...<Widget>[
          const SizedBox(height: 6),
          Text(
            days < 0 ? 'Échéance dépassée' : days == 0 ? 'Aujourd’hui' : days == 1 ? 'Demain' : 'Dans $days jours',
            style: t.bodySmall?.copyWith(color: days < 0 ? KombeColors.danger : KombeTokens.gold700, fontWeight: FontWeight.w700),
          ),
        ],
      ],
    );
  }
}

class _DeclaredCard extends StatelessWidget {
  const _DeclaredCard({required this.amountXaf, required this.percent});
  final int amountXaf;
  final int percent;

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    return _InfoCard(
      icon: Icons.account_balance_wallet_rounded,
      iconBg: KombeTokens.forest50,
      iconFg: KombeColors.emerald,
      children: <Widget>[
        Text('Déclaré ce mois', style: t.bodySmall),
        const SizedBox(height: 4),
        Text(Xaf.format(amountXaf), style: t.titleMedium?.copyWith(fontSize: 17, fontFeatures: const <FontFeature>[FontFeature.tabularFigures()])),
        const SizedBox(height: 8),
        Row(
          children: <Widget>[
            Expanded(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(99),
                child: LinearProgressIndicator(value: (percent / 100).clamp(0, 1), minHeight: 6),
              ),
            ),
            const SizedBox(width: 8),
            Text('$percent%', style: t.labelMedium?.copyWith(color: KombeColors.emerald)),
          ],
        ),
      ],
    );
  }
}

class _QuickActions extends StatelessWidget {
  const _QuickActions({required this.groupId});
  final String groupId;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: <Widget>[
        _ActionCircle(icon: Icons.upload_rounded, label: l10n.contribute, bg: KombeColors.forest, fg: Colors.white,
            onTap: () => context.push('/app/groups/$groupId/contributions/new')),
        _ActionCircle(icon: Icons.check_circle_outline_rounded, label: 'Valider', bg: KombeColors.gold, fg: Colors.white,
            onTap: () => context.push('/app/validations')),
        _ActionCircle(icon: Icons.groups_rounded, label: 'Voir le cycle', bg: KombeColors.sand, fg: KombeColors.forest,
            onTap: () => context.push('/app/groups/$groupId/cycle')),
        _ActionCircle(icon: Icons.history_rounded, label: l10n.history, bg: KombeColors.sand, fg: KombeColors.forest,
            onTap: () => context.push('/app/contributions')),
      ],
    );
  }
}

class _ActionCircle extends StatelessWidget {
  const _ActionCircle({required this.icon, required this.label, required this.bg, required this.fg, required this.onTap});
  final IconData icon;
  final String label;
  final Color bg;
  final Color fg;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
        button: true,
        label: label,
        child: ExcludeSemantics(
          child: InkResponse(
            onTap: onTap,
            radius: 44,
            child: SizedBox(
              width: 80,
              child: Column(
                children: <Widget>[
                  Container(
                    width: 68,
                    height: 68,
                    decoration: BoxDecoration(
                      color: bg,
                      shape: BoxShape.circle,
                      boxShadow: bg == KombeColors.sand
                          ? null
                          : <BoxShadow>[BoxShadow(color: bg.withValues(alpha: .28), blurRadius: 14, offset: const Offset(0, 6))],
                    ),
                    child: Icon(icon, color: fg, size: 28),
                  ),
                  const SizedBox(height: 8),
                  Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: KombeColors.ink, fontWeight: FontWeight.w600)),
                ],
              ),
            ),
          ),
        ),
      );
}

class _ActivityRow extends StatelessWidget {
  const _ActivityRow({required this.item, required this.now});
  final KombeNotification item;
  final DateTime? now;

  static IconData _icon(NotificationKind k) => switch (k) {
        NotificationKind.contribution => Icons.payments_outlined,
        NotificationKind.validation => Icons.verified_outlined,
        NotificationKind.meeting => Icons.campaign_outlined,
        NotificationKind.vote => Icons.how_to_vote_outlined,
        NotificationKind.dispute => Icons.gavel_rounded,
        NotificationKind.security => Icons.shield_outlined,
        NotificationKind.system => Icons.info_outline_rounded,
      };

  String _ago(DateTime at) {
    final Duration d = (now ?? DateTime.now()).difference(at.toLocal());
    if (d.inMinutes < 60) return 'Il y a ${d.inMinutes.clamp(1, 59)} min';
    if (d.inHours < 24) return 'Il y a ${d.inHours} heure${d.inHours > 1 ? 's' : ''}';
    if (d.inDays < 7) return 'Il y a ${d.inDays} jour${d.inDays > 1 ? 's' : ''}';
    return DateFormat.yMMMd('fr').format(at.toLocal());
  }

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12),
      decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: KombeColors.line))),
      child: Row(
        children: <Widget>[
          Container(
            width: 44,
            height: 44,
            decoration: const BoxDecoration(color: KombeColors.sand, shape: BoxShape.circle),
            child: Icon(_icon(item.kind), color: KombeColors.forest, size: 22),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(item.title, style: t.titleSmall?.copyWith(fontWeight: item.read ? FontWeight.w600 : FontWeight.w800)),
                const SizedBox(height: 2),
                Text(_ago(item.createdAtUtc), style: t.bodySmall),
              ],
            ),
          ),
          if (!item.read)
            Container(width: 8, height: 8, decoration: const BoxDecoration(color: KombeColors.emerald, shape: BoxShape.circle)),
        ],
      ),
    );
  }
}

/// Aucun groupe : une photo de cercle, une phrase, une action.
class _NoGroup extends StatelessWidget {
  const _NoGroup({required this.onJoin});
  final VoidCallback onJoin;

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        ClipRRect(
          borderRadius: BorderRadius.circular(22),
          child: Image.asset(KombePhotos.heroCircle, height: 180, fit: BoxFit.cover, excludeFromSemantics: true),
        ),
        const SizedBox(height: 20),
        Text('Vous n’avez encore rejoint aucune tontine.', style: t.titleLarge),
        const SizedBox(height: 8),
        Text('Avec un code d’invitation, vous rejoignez le cercle de votre groupe.', style: t.bodyMedium),
        const SizedBox(height: 18),
        FilledButton(onPressed: onJoin, child: const Text('Rejoindre une tontine')),
      ],
    );
  }
}
