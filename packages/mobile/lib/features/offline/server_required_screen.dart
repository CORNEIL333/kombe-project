import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/widgets/kombe_components.dart';
import '../../core/widgets/kombe_logo.dart';
import '../../l10n/app_localizations.dart';

class ServerRequiredScreen extends StatelessWidget {
  const ServerRequiredScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        body: SafeArea(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(28),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 520),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    const KombeLogo(size: 54),
                    const SizedBox(height: 28),
                    const KombeEmptyArt(icon: Icons.cloud_off_outlined, tone: KombeTone.warning),
                    const SizedBox(height: 18),
                    Text(
                      AppLocalizations.of(context).srVersionNonRelieeKombe,
                      style: Theme.of(context).textTheme.headlineMedium,
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 10),
                    Text(
                      AppLocalizations.of(context).srCetteVersionDeLapplicationNest,
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 24),
                    OutlinedButton(
                      onPressed: () => context.go('/login'),
                      child: Text(AppLocalizations.of(context).srRetourLaConnexion),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
}
