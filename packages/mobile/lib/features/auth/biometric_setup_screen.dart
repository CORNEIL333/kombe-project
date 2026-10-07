import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/security/biometric_service.dart';

class BiometricSetupScreen extends StatefulWidget {
  const BiometricSetupScreen({super.key});

  @override
  State<BiometricSetupScreen> createState() => _BiometricSetupScreenState();
}

class _BiometricSetupScreenState extends State<BiometricSetupScreen> {
  bool? _supported;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_supported == null) {
      context.read<BiometricService>().isSupported().then((bool value) {
        if (mounted) setState(() => _supported = value);
      });
    }
  }

  Future<void> _enable() async {
    final BiometricService biometrics = context.read<BiometricService>();
    final bool ok = await biometrics.authenticate(
      'Confirmez votre identité pour activer la biométrie KÓMBE.',
    );
    if (!mounted) return;
    if (ok) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Le terminal est compatible. L’activation finale sera liée à une session serveur valide.',
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Biométrie')),
    body: SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(24),
        children: <Widget>[
          Icon(
            Icons.fingerprint,
            size: 72,
            color: Theme.of(context).colorScheme.primary,
          ),
          const SizedBox(height: 22),
          Text(
            'Connexion biométrique',
            style: Theme.of(context).textTheme.headlineLarge,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 10),
          const Text(
            'KÓMBE peut utiliser la biométrie du système. Aucun gabarit biométrique n’est lu ou stocké par l’application.',
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 26),
          if (_supported == null)
            const Center(child: CircularProgressIndicator())
          else if (_supported!)
            FilledButton(
              onPressed: _enable,
              child: const Text('Vérifier la biométrie'),
            )
          else
            const Text(
              'La biométrie n’est pas disponible sur cet appareil.',
              textAlign: TextAlign.center,
            ),
          const SizedBox(height: 12),
          TextButton(
            onPressed: () => context.go('/login'),
            child: const Text('Plus tard'),
          ),
        ],
      ),
    ),
  );
}
