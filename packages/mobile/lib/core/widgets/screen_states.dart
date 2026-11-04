import 'package:flutter/material.dart';

import '../../l10n/app_localizations.dart';
import '../design/kombe_colors.dart';
import '../design/kombe_spacing.dart';
import '../state/resource.dart';

class ResourceView<T> extends StatelessWidget {
  const ResourceView({
    required this.resource,
    required this.builder,
    super.key,
    this.emptyWhen,
    this.emptyTitle,
    this.emptyBody,
    this.onRetry,
  });

  final Resource<T> resource;
  final Widget Function(BuildContext context, T data) builder;
  final bool Function(T data)? emptyWhen;
  final String? emptyTitle;
  final String? emptyBody;
  /// Bouton « Réessayer » sur échec ou indisponibilité.
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    return resource.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      unavailable: () => ServiceUnavailableState(
        title: l10n.serviceUnavailableTitle,
        body: l10n.serviceUnavailableBody,
        onRetry: onRetry,
      ),
      failure: (Object error) => ErrorState(message: error.toString(), onRetry: onRetry),
      ready: (T data) {
        if (emptyWhen?.call(data) ?? false) {
          return EmptyState(
            title: emptyTitle ?? l10n.noDataTitle,
            body: emptyBody ?? l10n.noDataBody,
          );
        }
        return builder(context, data);
      },
    );
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState({required this.title, required this.body, super.key});
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) => _StateCard(
        icon: Icons.inbox_outlined,
        title: title,
        body: body,
      );
}

class ServiceUnavailableState extends StatelessWidget {
  const ServiceUnavailableState({
    required this.title,
    required this.body,
    this.onRetry,
    super.key,
  });
  final String title;
  final String body;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => _StateCard(
        icon: Icons.cloud_off_outlined,
        title: title,
        body: body,
        onRetry: onRetry,
      );
}

class ErrorState extends StatelessWidget {
  const ErrorState({required this.message, this.onRetry, super.key});
  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => _StateCard(
        icon: Icons.error_outline,
        title: AppLocalizations.of(context).error,
        body: message,
        iconColor: KombeColors.danger,
        onRetry: onRetry,
      );
}

class _StateCard extends StatelessWidget {
  const _StateCard({
    required this.icon,
    required this.title,
    required this.body,
    this.iconColor = KombeColors.forest,
    this.onRetry,
  });

  final IconData icon;
  final String title;
  final String body;
  final Color iconColor;
  final VoidCallback? onRetry;

  /// Défilable (tirer pour actualiser fonctionne aussi sur un état vide ou
  /// une erreur), centré, sans carte superflue.
  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (BuildContext context, BoxConstraints c) => SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: c.maxHeight.isFinite ? c.maxHeight : 0),
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(KombeSpacing.screen),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 420),
                child: Semantics(
                  liveRegion: true,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: <Widget>[
                      Icon(icon, size: 40, color: iconColor),
                      const SizedBox(height: 16),
                      Text(title, style: Theme.of(context).textTheme.titleLarge, textAlign: TextAlign.center),
                      const SizedBox(height: 8),
                      Text(body, style: Theme.of(context).textTheme.bodyMedium, textAlign: TextAlign.center),
                      if (onRetry != null) ...<Widget>[
                        const SizedBox(height: 16),
                        OutlinedButton(onPressed: onRetry, child: const Text('Réessayer')),
                      ],
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
