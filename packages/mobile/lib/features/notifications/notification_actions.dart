import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/widgets/operation_feedback.dart';
import '../../domain/entities/notification.dart';
import '../../domain/repositories/notification_repository.dart';

/// Toucher une notification : elle est marquée lue
/// (`POST /v1/me/notifications/read`) et l'écran concerné s'ouvre.
Future<void> openNotification(BuildContext context, KombeNotification n, {VoidCallback? onRead}) async {
  final NotificationRepository repo = context.read<NotificationRepository>();
  if (!n.read) {
    unawaited(repo.markRead(n.id).then((_) => onRead?.call()));
  }
  final String? route = notificationRoute(target: n.target, groupId: n.groupId, code: n.code);
  if (route == null) {
    if (n.body.isNotEmpty) showKombeMessage(context, n.body);
    return;
  }
  await context.push(route);
}
