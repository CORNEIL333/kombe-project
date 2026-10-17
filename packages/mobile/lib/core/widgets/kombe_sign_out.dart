import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../domain/repositories/auth_repository.dart';
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
        title: const Text('Se déconnecter de KÓMBE ?'),
        content: const Text(
          'Vous quittez votre session sur ce téléphone. Vos tontines, vos versements et le registre restent enregistrés ; '
          'un nouveau code vous reconnectera.',
        ),
        actions: <Widget>[
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Annuler')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: KombeColors.danger),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Se déconnecter'),
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
          label: const Text('Se déconnecter'),
          style: OutlinedButton.styleFrom(
            foregroundColor: KombeColors.danger,
            side: const BorderSide(color: KombeColors.danger),
            minimumSize: const Size.fromHeight(54),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16),
          ),
        ),
      );
}
