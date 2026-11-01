import '../../core/state/operation_result.dart';
import '../../core/state/resource.dart';
import '../entities/notification.dart';

abstract interface class NotificationRepository {
  Future<Resource<List<KombeNotification>>> listNotifications();

  /// Nombre réel de non-lues (compté par le serveur, pas sur un extrait).
  Future<int> unreadCount();

  Future<OperationResult<void>> markRead(String notificationId);
  Future<OperationResult<void>> markAllRead();
}
