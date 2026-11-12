import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../domain/repositories/auth_repository.dart';
import '../../l10n/app_localizations.dart';
import '../design/kombe_colors.dart';

/// Déconnexion : toujours visible en bas du profil, toujours confirmée.
/// Le routeur renvoie à la connexion dès que la session est effacée.
class KombeBoutonDeconnexion extends StatefulWidget {
  const KombeBoutonDeconnexion({super.key});

  @override
  State<KombeBoutonDeconnexion> createState() => KombeBoutonDeconnexionState();
}

class KombeBoutonDeconnexionState extends State<KombeBoutonDeconnexion> {
  bool _enCours = false;

  Future<void> _confirmer() async {
    final bool? ok = await showDialog<bool>(
      context: context,
      builder: (BuildContext ctx) => AlertDialog(
        icon: const Icon(Icons.logout_rounded, color: KombeColors.danger, size: 30),
        title: Text(AppLocalizations.of(context).soSeDeconnecterDeKombe),
        content: Text(
          AppLocalizations.of(context).soVousQuittezVotreSessionSur,
        ),
        actions: <Widget>[
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: Text(AppLocalizations.of(context).cancel)),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: KombeColors.danger),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(AppLocalizations.of(context).signOut),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _enCours = true);
    await context.read<AuthRepository>().signOut();
    if (mounted) setState(() => _enCours = false);
  }

  @override
  Widget build(BuildContext context) => SizedBox(
        width: double.infinity,
        child: OutlinedButton.icon(
          key: const Key('kombe-deconnexion'),
          onPressed: _enCours ? null : _confirmer,
          icon: _enCours
              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(Icons.logout_rounded),
          label: Text(AppLocalizations.of(context).signOut),
          style: OutlinedButton.styleFrom(
            foregroundColor: KombeColors.danger,
            side: const BorderSide(color: KombeColors.danger),
            backgroundColor: Colors.transparent,
          ),
        ),
      );
}
