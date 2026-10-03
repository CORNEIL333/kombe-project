import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/design/kombe_spacing.dart';
import '../../core/formatters/xaf.dart';
import '../../core/widgets/group_hero_card.dart';
import '../../core/widgets/kombe_logo.dart';
import '../../core/widgets/screen_states.dart';
import '../../core/widgets/section_card.dart';
import '../../domain/entities/dashboard.dart';
import '../../domain/entities/notification.dart';
import '../../domain/repositories/dashboard_repository.dart';
import '../../l10n/app_localizations.dart';
import 'dashboard_view_model.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  late final DashboardViewModel _viewModel;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!(_initialized)) {
      _initialized = true;
      _viewModel = DashboardViewModel(context.read<DashboardRepository>())..load();
    }
  }

  bool _initialized = false;

  @override
  void dispose() {
    if (_initialized) _viewModel.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_initialized) return const SizedBox.shrink();
    return ListenableBuilder(
      listenable: _viewModel,
      builder: (BuildContext context, Widget? child) {
        return ResourceView<DashboardData>(
          resource: _viewModel.state,
          builder: (BuildContext context, DashboardData data) =>
              _DashboardContent(data: data, onRefresh: _viewModel.load),
        );
      },
    );
  }
}

class _DashboardContent extends StatelessWidget {
  const _DashboardContent({required this.data, required this.onRefresh});
  final DashboardData data;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final String locale = Localizations.localeOf(context).toLanguageTag();
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(
          KombeSpacing.screen,
          KombeSpacing.md,
          KombeSpacing.screen,
          100,
        ),
        children: <Widget>[
          Row(
            children: <Widget>[
              const KombeLogo(compact: true, size: 42),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  l10n.dashboard,
                  style: Theme.of(context).textTheme.headlineMedium,
                ),
              ),
              IconButton(
                tooltip: l10n.notifications,
                onPressed: () => context.go('/app/notifications'),
                icon: const Icon(Icons.notifications_none),
              ),
            ],
          ),
          const SizedBox(height: 20),
          if (data.primaryGroup case final group?)
            GroupHeroCard(
              group: group,
              onTap: () => context.push('/app/groups/${group.id}'),
            )
          else
            EmptyState(title: l10n.emptyGroups, body: l10n.noDataBody),
          const SizedBox(height: 14),
          Row(
            children: <Widget>[
              Expanded(
                child: _MetricCard(
                  icon: Icons.calendar_month_outlined,
                  label: 'Prochaine cotisation',
                  value: data.nextContributionAtUtc == null
                      ? '—'
                      : DateFormat.yMMMd(locale).format(data.nextContributionAtUtc!.toLocal()),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _MetricCard(
                  icon: Icons.account_balance_wallet_outlined,
                  label: 'Déclaré ce mois',
                  value: Xaf.format(data.currentMonthDeclaredXaf),
                  progress: data.progressPercent / 100,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: <Widget>[
              Expanded(
                child: _QuickAction(
                  icon: Icons.upload_outlined,
                  label: l10n.contribute,
                  onTap: data.primaryGroup == null
                      ? null
                      : () => context.push(
                            '/app/groups/${data.primaryGroup!.id}/contributions/new',
                          ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _QuickAction(
                  icon: Icons.verified_outlined,
                  label: l10n.validation,
                  onTap: () => context.push('/app/validations'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _QuickAction(
                  icon: Icons.groups_2_outlined,
                  label: l10n.cycle,
                  onTap: data.primaryGroup == null
                      ? null
                      : () => context.push('/app/groups/${data.primaryGroup!.id}/cycle'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _QuickAction(
                  icon: Icons.history,
                  label: l10n.history,
                  onTap: () => context.push('/app/contributions'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 22),
          Text('Activité récente', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 10),
          if (data.recentActivity.isEmpty)
            EmptyState(title: l10n.emptyNotifications, body: l10n.noDataBody)
          else
            SectionCard(
              child: Column(
                children: <Widget>[
                  for (final KombeNotification item in data.recentActivity)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: const CircleAvatar(
                        backgroundColor: KombeColors.mint,
                        foregroundColor: KombeColors.forest,
                        child: Icon(Icons.notifications_none),
                      ),
                      title: Text(item.title),
                      subtitle: Text(item.body),
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({
    required this.icon,
    required this.label,
    required this.value,
    this.progress,
  });

  final IconData icon;
  final String label;
  final String value;
  final double? progress;

  @override
  Widget build(BuildContext context) => SectionCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Icon(icon, color: KombeColors.goldDark),
            const SizedBox(height: 12),
            Text(label, style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 4),
            Text(value, style: Theme.of(context).textTheme.titleLarge),
            if (progress != null) ...<Widget>[
              const SizedBox(height: 10),
              LinearProgressIndicator(
                value: progress!.clamp(0, 1),
                minHeight: 6,
                borderRadius: BorderRadius.circular(99),
              ),
            ],
          ],
        ),
      );
}

class _QuickAction extends StatelessWidget {
  const _QuickAction({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => Semantics(
        button: true,
        enabled: onTap != null,
        label: label,
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: onTap,
          child: Ink(
            decoration: BoxDecoration(
              color: onTap == null ? Colors.grey.shade100 : Colors.white,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: KombeColors.line),
            ),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 4),
              child: Column(
                children: <Widget>[
                  Icon(
                    icon,
                    color: onTap == null ? KombeColors.slate : KombeColors.forest,
                  ),
                  const SizedBox(height: 7),
                  Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.labelSmall,
                  ),
                ],
              ),
            ),
          ),
        ),
      );
}
