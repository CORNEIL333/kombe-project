import 'package:flutter/material.dart';

import '../../l10n/app_localizations.dart';
import '../design/kombe_spacing.dart';
import '../state/resource.dart';
import 'kombe_components.dart';

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
      loading: () => const KombeListSkeleton(),
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
  const EmptyState({required this.title, required this.body, super.key, this.icon = Icons.inbox_outlined, this.action});
  final String title;
  final String body;
  final IconData icon;
  /// Action principale de l'état vide (ex. « Créer un groupe »).
  final Widget? action;

  @override
  Widget build(BuildContext context) => _StateCard(
        icon: icon,
        title: title,
        body: body,
        action: action,
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
        tone: KombeTone.danger,
        onRetry: onRetry,
      );
}

class _StateCard extends StatelessWidget {
  const _StateCard({
    required this.icon,
    required this.title,
    required this.body,
    this.tone = KombeTone.brand,
    this.onRetry,
    this.action,
  });

  final IconData icon;
  final String title;
  final String body;
  final KombeTone tone;
  final VoidCallback? onRetry;
  final Widget? action;

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
                      KombeEmptyArt(icon: icon, tone: tone),
                      const SizedBox(height: 18),
                      Text(title, style: Theme.of(context).textTheme.headlineSmall, textAlign: TextAlign.center),
                      const SizedBox(height: 8),
                      Text(body, style: Theme.of(context).textTheme.bodyMedium, textAlign: TextAlign.center),
                      if (action != null) ...<Widget>[const SizedBox(height: 22), action!],
                      if (onRetry != null) ...<Widget>[
                        const SizedBox(height: 20),
                        OutlinedButton.icon(
                          onPressed: onRetry,
                          style: OutlinedButton.styleFrom(minimumSize: const Size(160, 48)),
                          icon: const Icon(Icons.refresh_rounded),
                          label: Text(AppLocalizations.of(context).csReessayer),
                        ),
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
