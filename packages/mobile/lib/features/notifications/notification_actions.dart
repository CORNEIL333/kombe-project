import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/web/kombe_web.dart';
import '../../core/widgets/operation_feedback.dart';
import '../../domain/entities/notification.dart';
import '../../domain/repositories/notification_repository.dart';
import 'notification_catalog.dart';

/// Toucher une notification : elle est marquée lue
/// (`POST /v1/me/notifications/read`, sans attendre le réseau) et mène à
/// l'écran où l'action se fait — rien n'est décidé à la place de la
/// personne. Le serveur re-vérifie les droits à l'arrivée.
Future<void> openNotification(BuildContext context, KombeNotification n, {VoidCallback? onRead}) async {
  if (!n.read) {
    unawaited(context.read<NotificationRepository>().markRead(n.id).then((_) => onRead?.call()));
  }
  switch (destinationFor(n)) {
    case InAppDestination(:final String route):
      await context.push(route);
    case WebDestination(:final String fragment, :final String label):
      await openInKombeWeb(context, fragment: fragment, title: label);
    case NoDestination():
      if (n.body.isNotEmpty) showKombeMessage(context, n.body);
  }
}

IconData notificationIcon(NotificationKind kind) => switch (kind) {
      NotificationKind.contribution => Icons.payments_outlined,
      NotificationKind.validation => Icons.fact_check_outlined,
      NotificationKind.meeting => Icons.event_outlined,
      NotificationKind.vote => Icons.how_to_vote_outlined,
      NotificationKind.dispute => Icons.gavel_outlined,
      NotificationKind.security => Icons.shield_outlined,
      NotificationKind.system => Icons.notifications_none_rounded,
    };

/// « il y a 5 min », « hier », « 12 oct. ».
String relativeTime(DateTime utc, {DateTime? now}) {
  final DateTime n = now ?? DateTime.now().toUtc();
  final Duration d = n.difference(utc);
  if (d.inMinutes < 1) return 'à l’instant';
  if (d.inMinutes < 60) return 'il y a ${d.inMinutes} min';
  if (d.inHours < 24) return 'il y a ${d.inHours} h';
  if (d.inDays < 2) return 'hier';
  if (d.inDays < 7) return 'il y a ${d.inDays} jours';
  const List<String> mois = <String>['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  final DateTime l = utc.toLocal();
  return '${l.day} ${mois[l.month - 1]}';
}
