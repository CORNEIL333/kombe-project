import '../../core/state/operation_result.dart';
import '../../core/state/resource.dart';
import '../entities/notification.dart';

abstract interface class NotificationRepository {
  Future<Resource<List<KombeNotification>>> listNotifications();
  Future<OperationResult<void>> markRead(String notificationId);
}
