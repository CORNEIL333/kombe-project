import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/design/kombe_spacing.dart';
import '../../core/design/kombe_tokens.g.dart';
import '../../core/formatters/xaf.dart';
import '../../core/widgets/cycle_orbit.dart';
import '../../core/widgets/kombe_figure.dart';
import '../../core/widgets/kombe_mark.dart';
import '../../domain/entities/dashboard.dart';
import '../../domain/entities/group.dart';
import '../../domain/entities/notification.dart';
import '../../l10n/app_localizations.dart';

/// Accueil — couche C. Répond dans l'ordre à quatre questions :
/// 1. Dans quelle tontine suis-je ?  → identité du groupe
/// 2. Où en est le cycle ?           → orbite (ancre visuelle unique)
/// 3. Qu'attend-on de moi ?          → UNE prochaine action
/// 4. Que s'est-il passé ?           → trajectoire d'activité
/// Aucune valeur n'est fabriquée : tout vient de [DashboardData].
class DashboardContent extends StatelessWidget {
  const DashboardContent({required this.data, required this.onRefresh, super.key, this.animate = true});
  final DashboardData data;
  final Future<void> Function() onRefresh;
  final bool animate;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final GroupSummary? group = data.primaryGroup;
    return RefreshIndicator(
      onRefresh: onRefresh,
      color: KombeColors.emerald,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(KombeSpacing.screen, KombeSpacing.sm, KombeSpacing.screen, 112),
        children: <Widget>[
          _TopBar(group: group, notificationsLabel: l10n.notifications),
          const SizedBox(height: 8),
          if (group == null)
            _NoGroup(onJoin: () => context.push('/app/groups/join'))
          else ...<Widget>[
            Center(
              child: KombeCycleOrbit(
                total: group.cycleTotal,
                current: group.cycleIndex,
                size: 232,
                animate: animate,
                semanticLabel: 'Cycle de ${group.cycleTotal} tours, tour ${group.cycleIndex} en cours',
                center: _OrbitCenter(index: group.cycleIndex, total: group.cycleTotal),
              ),
            ),
            const SizedBox(height: 6),
            Center(
              child: TextButton(
                onPressed: () => context.push('/app/groups/${group.id}/cycle'),
                child: const Text('Voir l’ordre des tours'),
              ),
            ),
            const SizedBox(height: 10),
            _NextAction(
              group: group,
              dueAtUtc: data.nextContributionAtUtc,
              onDeclare: () => context.push('/app/groups/${group.id}/contributions/new'),
            ),
            const SizedBox(height: 14),
            _MonthLine(declaredXaf: data.currentMonthDeclaredXaf, percent: data.progressPercent),
          ],
          // Sans groupe, une seule action compte : rejoindre. Le reste attend.
          if (group != null) ...<Widget>[
            const SizedBox(height: 28),
            _SectionTitle(title: 'Activité récente', action: 'Historique', onAction: () => context.push('/app/contributions')),
            const SizedBox(height: 6),
            if (data.recentActivity.isEmpty)
              const _QuietEmpty(text: 'L’historique de ce groupe apparaîtra ici.')
            else
              _Timeline(items: data.recentActivity),
            const SizedBox(height: 20),
            _Shortcuts(
              onValidate: () => context.push('/app/validations'),
              onVotes: () => context.push('/app/votes'),
            ),
            ],
        ],
      ),
    );
  }
}

class _TopBar extends StatelessWidget {
  const _TopBar({required this.group, required this.notificationsLabel});
  final GroupSummary? group;
  final String notificationsLabel;

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    return Row(
      children: <Widget>[
        const KombeMark(size: 30),
        const SizedBox(width: 12),
        Expanded(
          child: group == null
              ? Text('KÓMBE', style: t.titleMedium?.copyWith(letterSpacing: 1.6, color: KombeColors.forest))
              : Semantics(
                  button: true,
                  label: 'Groupe ${group!.name}',
                  child: InkWell(
                    borderRadius: BorderRadius.circular(KombeTokens.radiusSm),
                    onTap: () => context.push('/app/groups/${group!.id}'),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 6),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          Text('MON GROUPE', style: t.labelSmall),
                          const SizedBox(height: 2),
                          Text(group!.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: t.titleMedium),
                        ],
                      ),
                    ),
                  ),
                ),
        ),
        IconButton(
          tooltip: notificationsLabel,
          onPressed: () => context.go('/app/notifications'),
          icon: const Icon(Icons.notifications_none_rounded),
        ),
      ],
    );
  }
}

class _OrbitCenter extends StatelessWidget {
  const _OrbitCenter({required this.index, required this.total});
  final int index;
  final int total;

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        Text.rich(
          TextSpan(
            children: <InlineSpan>[
              TextSpan(text: '$index', style: t.displaySmall?.copyWith(fontFamily: KombeTokens.fontUi, fontWeight: FontWeight.w800, letterSpacing: -1.5)),
              TextSpan(text: ' / $total', style: t.titleMedium?.copyWith(color: KombeColors.slate)),
            ],
          ),
          style: const TextStyle(fontFeatures: <FontFeature>[FontFeature.tabularFigures()]),
        ),
        const SizedBox(height: 2),
        Text('tour en cours', style: t.bodySmall),
      ],
    );
  }
}

class _NextAction extends StatelessWidget {
  const _NextAction({required this.group, required this.dueAtUtc, required this.onDeclare});
  final GroupSummary group;
  final DateTime? dueAtUtc;
  final VoidCallback onDeclare;

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    final String locale = Localizations.localeOf(context).toLanguageTag();
    final String due = dueAtUtc == null ? '' : ' · avant le ${DateFormat.MMMd(locale).format(dueAtUtc!.toLocal())}';
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 18),
      decoration: BoxDecoration(
        color: KombeColors.forest,
        borderRadius: BorderRadius.circular(KombeTokens.radiusXl),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text('PROCHAINE ACTION$due'.toUpperCase(), style: t.labelSmall?.copyWith(color: KombeTokens.gold300)),
          const SizedBox(height: 8),
          Text(
            Xaf.format(group.contributionAmountXaf),
            style: t.headlineMedium?.copyWith(color: KombeColors.cream),
          ),
          const SizedBox(height: 2),
          Text('Votre cotisation du tour ${group.cycleIndex}.', style: t.bodyMedium?.copyWith(color: KombeTokens.sand200)),
          const SizedBox(height: 16),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: KombeColors.cream, foregroundColor: KombeColors.forest),
            onPressed: onDeclare,
            child: const Text('Déclarer ma cotisation'),
          ),
          const SizedBox(height: 10),
          // Transparence (mandat §50) : ce qui se passera ensuite, avant d'agir.
          Text(
            'Après votre déclaration, un membre autorisé devra la valider.',
            style: t.bodySmall?.copyWith(color: KombeTokens.sand200),
          ),
        ],
      ),
    );
  }
}

class _MonthLine extends StatelessWidget {
  const _MonthLine({required this.declaredXaf, required this.percent});
  final int declaredXaf;
  final int percent;

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    return Semantics(
      label: 'Déclaré ce mois : ${Xaf.format(declaredXaf)}, $percent pour cent',
      child: ExcludeSemantics(
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 12),
          decoration: const BoxDecoration(
            border: Border(top: BorderSide(color: KombeColors.line), bottom: BorderSide(color: KombeColors.line)),
          ),
          child: Row(
            children: <Widget>[
              Expanded(child: Text('Déclaré ce mois', style: t.bodyMedium)),
              Text(Xaf.format(declaredXaf), style: t.titleSmall?.copyWith(fontFeatures: const <FontFeature>[FontFeature.tabularFigures()])),
              const SizedBox(width: 10),
              SizedBox(
                width: 56,
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(99),
                  child: LinearProgressIndicator(value: (percent / 100).clamp(0, 1), minHeight: 4),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.title, required this.action, required this.onAction});
  final String title;
  final String action;
  final VoidCallback onAction;

  @override
  Widget build(BuildContext context) => Row(
        children: <Widget>[
          Expanded(child: Text(title, style: Theme.of(context).textTheme.titleLarge)),
          TextButton(onPressed: onAction, child: Text(action)),
        ],
      );
}

/// Trajectoire : les événements sont reliés par un chemin (« trajectoire =
/// historique »). Le nœud non lu est plein, le lu est creux.
class _Timeline extends StatelessWidget {
  const _Timeline({required this.items});
  final List<KombeNotification> items;

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    final String locale = Localizations.localeOf(context).toLanguageTag();
    return Column(
      children: <Widget>[
        for (int i = 0; i < items.length; i++)
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                SizedBox(
                  width: 22,
                  child: CustomPaint(painter: _PathNode(first: i == 0, last: i == items.length - 1, unread: !items[i].read)),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Text(items[i].title, style: t.titleSmall),
                        if (items[i].body.isNotEmpty) ...<Widget>[
                          const SizedBox(height: 2),
                          Text(items[i].body, style: t.bodySmall),
                        ],
                      ],
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.only(top: 12, left: 8),
                  child: Text(DateFormat.MMMd(locale).format(items[i].createdAtUtc.toLocal()), style: t.labelMedium),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _PathNode extends CustomPainter {
  const _PathNode({required this.first, required this.last, required this.unread});
  final bool first;
  final bool last;
  final bool unread;

  @override
  void paint(Canvas canvas, Size size) {
    final double x = size.width / 2;
    const double y = 20;
    final Paint line = Paint()
      ..color = KombeColors.lineStrong
      ..strokeWidth = 1.5;
    if (!first) canvas.drawLine(Offset(x, 0), Offset(x, y - 6), line);
    if (!last) canvas.drawLine(Offset(x, y + 6), Offset(x, size.height), line);
    canvas.drawCircle(const Offset(0, 0) + Offset(x, y), 5.5, Paint()..color = unread ? KombeColors.emerald : KombeColors.cream);
    canvas.drawCircle(
      Offset(x, y),
      5.5,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2
        ..color = unread ? KombeColors.emerald : KombeColors.lineStrong,
    );
  }

  @override
  bool shouldRepaint(covariant _PathNode o) => o.first != first || o.last != last || o.unread != unread;
}

class _Shortcuts extends StatelessWidget {
  const _Shortcuts({required this.onValidate, required this.onVotes});
  final VoidCallback onValidate;
  final VoidCallback onVotes;

  @override
  Widget build(BuildContext context) => Row(
        children: <Widget>[
          Expanded(child: OutlinedButton(onPressed: onValidate, child: const Text('Validations'))),
          const SizedBox(width: 10),
          Expanded(child: OutlinedButton(onPressed: onVotes, child: const Text('Votes'))),
        ],
      );
}

class _QuietEmpty extends StatelessWidget {
  const _QuietEmpty({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Text(text, style: Theme.of(context).textTheme.bodyMedium),
      );
}

/// État vide de marque : un nœud seul qui attend les autres.
class _NoGroup extends StatelessWidget {
  const _NoGroup({required this.onJoin});
  final VoidCallback onJoin;

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.only(top: 24),
      child: Column(
        children: <Widget>[
          const SizedBox(
            width: 168,
            height: 168,
            child: CustomPaint(painter: _LoneNodePainter()),
          ),
          const SizedBox(height: 20),
          Text('Vous n’avez encore rejoint aucune tontine.', textAlign: TextAlign.center, style: t.titleLarge),
          const SizedBox(height: 8),
          Text(
            'Avec un code d’invitation, vous rejoignez le cercle de votre groupe.',
            textAlign: TextAlign.center,
            style: t.bodyMedium,
          ),
          const SizedBox(height: 20),
          FilledButton(onPressed: onJoin, child: const Text('Rejoindre une tontine')),
        ],
      ),
    );
  }
}

class _LoneNodePainter extends CustomPainter {
  const _LoneNodePainter();

  @override
  void paint(Canvas canvas, Size size) {
    final Offset c = size.center(Offset.zero);
    final double r = size.shortestSide / 2 - 10;
    const int dashes = 36;
    final Paint dash = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round
      ..color = KombeColors.lineStrong;
    for (int i = 0; i < dashes; i++) {
      final double a = i * 2 * 3.14159265 / dashes;
      canvas.drawArc(Rect.fromCircle(center: c, radius: r), a, 0.06, false, dash);
    }
    // Places vides autour de l'anneau, et une seule personne qui attend les autres.
    for (int i = 1; i < 6; i++) {
      final double a = -3.14159265 / 2 + i * 2 * 3.14159265 / 6;
      paintKombeFigure(canvas, c + Offset(math.cos(a), math.sin(a)) * r, 11,
          fill: KombeColors.cream, outline: KombeColors.lineStrong, outlineWidth: 1.5);
    }
    paintKombeFigure(canvas, Offset(c.dx, c.dy - r), 16, fill: KombeColors.gold);
  }

  @override
  bool shouldRepaint(covariant _LoneNodePainter oldDelegate) => false;
}
