import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../app/router/main_shell.dart';
import '../../core/design/kombe_colors.dart';
import '../../core/state/operation_result.dart';
import '../../core/state/resource.dart';
import '../../core/widgets/screen_states.dart';
import '../../domain/entities/notification.dart';
import '../../domain/repositories/notification_repository.dart';
import 'notification_actions.dart';

/// Activité : ce qui vous concerne dans vos groupes. Chaque ligne mène à
/// l'action ; les non-lues d'abord.
class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  Resource<List<KombeNotification>> _state = const ResourceLoading<List<KombeNotification>>();

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
  }

  Future<void> _readAll() async {
    final OperationResult<void> r = await context.read<NotificationRepository>().markAllRead();
    if (!mounted) return;
    if (r is OperationSuccess<void>) {
      _markLocally((_) => true);
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
    return Scaffold(
      appBar: KombeTopBar(
        title: const Text('Activité'),
        actions: <Widget>[
          if (anyUnread)
            IconButton(tooltip: 'Tout marquer comme lu', onPressed: _readAll, icon: const Icon(Icons.done_all_rounded)),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ResourceView<List<KombeNotification>>(
          resource: _state,
          emptyWhen: (List<KombeNotification> items) => items.isEmpty,
          builder: (BuildContext context, List<KombeNotification> items) {
            final List<KombeNotification> unread = items.where((KombeNotification n) => !n.read).toList();
            final List<KombeNotification> read = items.where((KombeNotification n) => n.read).toList();
            return ListView(
              padding: const EdgeInsets.only(bottom: 24),
              children: <Widget>[
                if (unread.isNotEmpty) _Header('Non lues · ${unread.length}'),
                for (final KombeNotification n in unread) NotificationTile(n: n, onTap: () => _open(n)),
                if (read.isNotEmpty) const _Header('Plus tôt'),
                for (final KombeNotification n in read) NotificationTile(n: n, onTap: () => _open(n)),
              ],
            );
          },
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
        padding: const EdgeInsets.fromLTRB(20, 18, 20, 6),
        child: Semantics(header: true, child: Text(text, style: Theme.of(context).textTheme.titleSmall)),
      );
}

/// Ligne de notification, partagée avec l'accueil.
class NotificationTile extends StatelessWidget {
  const NotificationTile({super.key, required this.n, required this.onTap, this.now});
  final KombeNotification n;
  final VoidCallback onTap;
  /// Horloge injectable (captures de référence stables).
  final DateTime? now;

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    return Semantics(
      label: n.read ? null : 'non lue',
      child: ListTile(
        minVerticalPadding: 12,
        leading: CircleAvatar(
          backgroundColor: n.read ? KombeColors.line : KombeColors.mint,
          foregroundColor: KombeColors.forest,
          child: Icon(notificationIcon(n.kind), size: 22),
        ),
        title: Text(n.title, style: t.bodyLarge?.copyWith(fontWeight: n.read ? FontWeight.w500 : FontWeight.w700)),
        subtitle: Text(<String>[if (n.body.isNotEmpty) n.body, relativeTime(n.createdAtUtc, now: now)].join(' · ')),
        trailing: n.read
            ? const Icon(Icons.chevron_right_rounded)
            : const Icon(Icons.circle, size: 10, color: KombeColors.forest),
        onTap: onTap,
      ),
    );
  }
}
