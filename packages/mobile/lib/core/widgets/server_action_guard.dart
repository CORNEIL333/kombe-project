import 'package:flutter/material.dart';

import '../../l10n/app_localizations.dart';
import '../design/kombe_colors.dart';

Future<void> showServerAuthorityRequired(BuildContext context) async {
  final AppLocalizations l10n = AppLocalizations.of(context);
  await showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    builder: (BuildContext context) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            const CircleAvatar(
              radius: 28,
              backgroundColor: KombeColors.mint,
              foregroundColor: KombeColors.forest,
              child: Icon(Icons.verified_user_outlined, size: 30),
            ),
            const SizedBox(height: 16),
            Text(
              l10n.serverAuthorityRequired,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 8),
            Text(
              l10n.serverValidatedOnly,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(),
              child: Text(l10n.confirm),
            ),
          ],
        ),
      ),
    ),
  );
}
