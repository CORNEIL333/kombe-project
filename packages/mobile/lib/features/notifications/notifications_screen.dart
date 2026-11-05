import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../app/router/main_shell.dart';
import '../../core/design/kombe_colors.dart';
import '../../core/widgets/kombe_components.dart';
import '../../core/design/kombe_theme.dart';
import '../../core/state/operation_result.dart';
import '../../core/state/resource.dart';
import '../../core/widgets/kombe_screen_header.dart';
import '../../core/widgets/screen_states.dart';
import '../../domain/entities/notification.dart';
import '../../domain/repositories/notification_repository.dart';
import 'notification_actions.dart';

/// Familles de filtre (planche) : Tout, Cotisations, Votes, Décisions.
enum _Filter { all, money, votes, decisions }

const Set<String> _money = <String>{'declared', 'toControl', 'rejected', 'due', 'payout', 'received', 'reserve', 'fund', 'aidPaid'};
const Set<String> _votes = <String>{'decision', 'decision-closed', 'decision-lifted', 'swap', 'swap-ready', 'swap-applied', 'draw'};
const Set<String> _decisions = <String>{'fine', 'fineDecision', 'contest', 'aid', 'aidDecision', 'statutes', 'role', 'admission', 'join', 'cycle'};

bool _matches(_Filter f, KombeNotification n) => switch (f) {
      _Filter.all => true,
      _Filter.money => _money.contains(n.topic),
      _Filter.votes => _votes.contains(n.topic),
      _Filter.decisions => _decisions.contains(n.topic),
    };

/// « Aujourd'hui », « Cette semaine », « Plus tôt » (jour calendaire local).
int _period(DateTime utc, DateTime now) {
  final DateTime d = utc.toLocal();
  final int days = DateTime(now.year, now.month, now.day).difference(DateTime(d.year, d.month, d.day)).inDays;
  return days <= 0 ? 0 : (days < 7 ? 1 : 2);
}

/// Activité (planche) : historique complet, filtres discrets, regroupement
/// temporel ; chaque ligne mène à l'action et se marque lue à l'ouverture.
class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key, this.now});
  final DateTime? now;

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  Resource<List<KombeNotification>> _state = const ResourceLoading<List<KombeNotification>>();
  _Filter _filter = _Filter.all;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final Resource<List<KombeNotification>> state = await context.read<NotificationRepository>().listNotifications();
    if (mounted) setState(() => _state = state);
  }

  void _markLocally(bool Function(KombeNotification) which) {
    if (_state case ResourceReady<List<KombeNotification>>(:final List<KombeNotification> data)) {
      setState(() => _state = ResourceReady<List<KombeNotification>>(
            data.map((KombeNotification n) => which(n) ? n.markedRead() : n).toList(),
          ));
    }
  }

  Future<void> _open(KombeNotification n) async {
    _markLocally((KombeNotification x) => x.id == n.id);
    await openNotification(context, n);
    if (mounted) KombeShellScope.of(context)?.refreshUnread();
  }

  Future<void> _readAll() async {
    final OperationResult<void> r = await context.read<NotificationRepository>().markAllRead();
    if (!mounted) return;
    if (r is OperationSuccess<void>) {
      _markLocally((_) => true);
      KombeShellScope.of(context)?.refreshUnread();
    } else if (r case OperationFailure<void>(:final Object error)) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$error')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final bool anyUnread = switch (_state) {
      ResourceReady<List<KombeNotification>>(:final List<KombeNotification> data) => data.any((KombeNotification n) => !n.read),
      _ => false,
    };
    final DateTime now = widget.now ?? DateTime.now();
    return Scaffold(
      backgroundColor: KombeColors.cream,
      appBar: KombeShellScope.of(context) == null ? AppBar(title: const Text('Activité')) : const KombeTopBar(),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.only(bottom: 24),
          children: <Widget>[
            const KombeScreenHeader(title: 'Activité'),
            SizedBox(
              height: 48,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                children: <Widget>[
                  for (final (_Filter f, String label) in <(_Filter, String)>[
                    (_Filter.all, 'Tout'),
                    (_Filter.money, 'Cotisations'),
                    (_Filter.votes, 'Votes'),
                    (_Filter.decisions, 'Décisions'),
                  ])
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(
                        label: Text(label),
                        selected: _filter == f,
                        showCheckmark: false,
                        selectedColor: KombeColors.forest,
                        backgroundColor: Colors.white,
                        side: BorderSide(color: _filter == f ? KombeColors.forest : KombeColors.line),
                        labelStyle: TextStyle(color: _filter == f ? KombeColors.cream : KombeColors.ink, fontWeight: FontWeight.w700),
                        onSelected: (_) => setState(() => _filter = f),
                      ),
                    ),
                  if (anyUnread)
                    TextButton(onPressed: _readAll, child: const Text('Tout marquer comme lu')),
                ],
              ),
            ),
            ResourceView<List<KombeNotification>>(
              resource: _state,
              onRetry: _load,
              emptyWhen: (List<KombeNotification> items) => items.isEmpty,
              emptyTitle: 'Aucune activité',
              emptyBody: 'Les déclarations, votes et séances de vos groupes apparaîtront ici.',
              builder: (BuildContext context, List<KombeNotification> items) {
                final List<KombeNotification> visible = items.where((KombeNotification n) => _matches(_filter, n)).toList();
                if (visible.isEmpty) {
                  return const Padding(padding: EdgeInsets.all(24), child: Text('Rien dans cette catégorie pour le moment.'));
                }
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: <Widget>[
                    for (final (int p, String label) in <(int, String)>[(0, 'Aujourd’hui'), (1, 'Cette semaine'), (2, 'Plus tôt')])
                      if (visible.any((KombeNotification n) => _period(n.createdAtUtc, now) == p)) ...<Widget>[
                        _Header(label),
                        Stack(
                          children: <Widget>[
                            const Positioned(left: 40, top: 8, bottom: 8, child: KombeStitch(vertical: true)),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: <Widget>[
                                for (final KombeNotification n in visible.where((KombeNotification n) => _period(n.createdAtUtc, now) == p))
                                  NotificationTile(n: n, now: widget.now?.toUtc(), onTap: () => _open(n)),
                              ],
                            ),
                          ],
                        ),
                      ],
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 4),
        child: Semantics(header: true, child: Text(text, style: KombeType.display(size: 21))),
      );
}

/// Ligne de notification (planche), partagée avec l'accueil et la cloche.
class NotificationTile extends StatelessWidget {
  const NotificationTile({super.key, required this.n, required this.onTap, this.now});
  final KombeNotification n;
  final VoidCallback onTap;
  /// Horloge injectable (captures de référence stables).
  final DateTime? now;

  @override
  Widget build(BuildContext context) {
    final KombeTone tone = _money.contains(n.topic)
        ? KombeTone.money
        : _votes.contains(n.topic)
            ? KombeTone.info
            : _decisions.contains(n.topic)
                ? KombeTone.coral
                : KombeTone.success;
    return Semantics(
      label: n.read ? null : 'non lue',
      child: Material(
        type: MaterialType.transparency,
        child: ListTile(
          minVerticalPadding: 10,
          leading: Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(color: tone.solid, shape: BoxShape.circle),
            child: Icon(notificationIcon(n.kind), size: 21, color: tone.onSolid),
          ),
          title: Text(n.title, style: TextStyle(fontWeight: n.read ? FontWeight.w600 : FontWeight.w800, fontSize: 15.5)),
          subtitle: Text(<String>[if (n.body.isNotEmpty) n.body, relativeTime(n.createdAtUtc, now: now)].join(' · ')),
          trailing: n.read ? null : const Icon(Icons.circle, size: 11, color: KombeColors.danger),
          onTap: onTap,
        ),
      ),
    );
  }
}
