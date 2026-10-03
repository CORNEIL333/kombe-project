import 'group.dart';
import 'notification.dart';

final class DashboardData {
  const DashboardData({
    required this.primaryGroup,
    required this.nextContributionAtUtc,
    required this.currentMonthDeclaredXaf,
    required this.progressPercent,
    required this.recentActivity,
  });

  final GroupSummary? primaryGroup;
  final DateTime? nextContributionAtUtc;
  final int currentMonthDeclaredXaf;
  final int progressPercent;
  final List<KombeNotification> recentActivity;
}
