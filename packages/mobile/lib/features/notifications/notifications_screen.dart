import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/state/operation_result.dart';
import '../../core/state/resource.dart';
import '../../core/widgets/screen_states.dart';
import '../../domain/entities/notification.dart';
import '../../domain/repositories/notification_repository.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  Resource<List<KombeNotification>> _state =
      const ResourceLoading<List<KombeNotification>>();

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _load();
  }

  Future<void> _load() async {
    final Resource<List<KombeNotification>> state =
        await context.read<NotificationRepository>().listNotifications();
    if (mounted) setState(() => _state = state);
  }

  Future<void> _markRead(KombeNotification item) async {
    if (item.read) return;
    final OperationResult<void> result =
        await context.read<NotificationRepository>().markRead(item.id);
    if (!mounted) return;
    if (result case OperationSuccess<void>()) {
      await _load();
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Notifications')),
        body: ResourceView<List<KombeNotification>>(
          resource: _state,
          emptyWhen: (List<KombeNotification> items) => items.isEmpty,
          builder: (BuildContext context, List<KombeNotification> items) =>
              ListView.separated(
            padding: const EdgeInsets.all(20),
            itemCount: items.length,
            separatorBuilder: (_, __) => const Divider(),
            itemBuilder: (BuildContext context, int index) {
              final KombeNotification item = items[index];
              return ListTile(
                contentPadding: EdgeInsets.zero,
                leading: CircleAvatar(
                  child: Icon(_iconFor(item.kind)),
                ),
                title: Text(item.title),
                subtitle: Text(item.body),
                trailing: item.read
                    ? null
                    : const Icon(Icons.circle, size: 10),
                onTap: () => _markRead(item),
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
