import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/state/resource.dart';
import '../../core/widgets/screen_states.dart';
import '../../domain/entities/notification.dart';
import '../../domain/repositories/notification_repository.dart';
import 'notification_actions.dart';

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

  Future<void> _open(KombeNotification item) async {
    // Lue tout de suite à l'écran ; le serveur l'enregistre en parallèle.
    if (_state case ResourceReady<List<KombeNotification>>(:final List<KombeNotification> data)) {
      setState(() => _state = ResourceReady<List<KombeNotification>>(
            <KombeNotification>[for (final KombeNotification n in data) n.id == item.id ? n.copyWith(read: true) : n],
          ));
    }
    await openNotification(context, item);
    if (mounted) await _load();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Notifications')),
        body: RefreshIndicator(
          onRefresh: _load,
          child: ResourceView<List<KombeNotification>>(
            resource: _state,
            emptyWhen: (List<KombeNotification> items) => items.isEmpty,
            emptyTitle: 'Aucune notification',
            emptyBody: 'Les rappels d’échéance, les statuts à accepter et les décisions de vos groupes apparaîtront ici.',
            builder: (BuildContext context, List<KombeNotification> items) {
              final String locale = Localizations.localeOf(context).toLanguageTag();
              return ListView.separated(
                padding: const EdgeInsets.all(20),
                itemCount: items.length,
                separatorBuilder: (_, _) => const Divider(),
                itemBuilder: (BuildContext context, int index) {
                  final KombeNotification item = items[index];
                  final TextTheme t = Theme.of(context).textTheme;
                  return ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: CircleAvatar(
                      backgroundColor: item.read ? KombeColors.sand : KombeColors.mint,
                      foregroundColor: KombeColors.forest,
                      child: Icon(_iconFor(item.kind)),
                    ),
                    title: Text(item.title, style: item.read ? null : const TextStyle(fontWeight: FontWeight.w700)),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        if (item.body.isNotEmpty) Text(item.body),
                        Text(DateFormat.MMMd(locale).add_Hm().format(item.createdAtUtc.toLocal()), style: t.bodySmall),
                      ],
                    ),
                    trailing: item.read
                        ? const Icon(Icons.chevron_right_rounded, color: KombeColors.slate)
                        : const Icon(Icons.circle, size: 10, color: KombeColors.forest),
                    onTap: () => _open(item),
                  );
                },
              );
            },
          ),
        ),
      );

  IconData _iconFor(NotificationKind kind) => switch (kind) {
        NotificationKind.contribution => Icons.payments_outlined,
        NotificationKind.validation => Icons.verified_outlined,
        NotificationKind.meeting => Icons.groups_outlined,
        NotificationKind.vote => Icons.how_to_vote_outlined,
        NotificationKind.dispute => Icons.gavel_outlined,
        NotificationKind.security => Icons.security_outlined,
        NotificationKind.system => Icons.info_outline,
      };
}
