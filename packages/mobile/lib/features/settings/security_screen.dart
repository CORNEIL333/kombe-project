import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/security/biometric_service.dart';
import '../../core/widgets/section_card.dart';
import '../../domain/repositories/preferences_repository.dart';

class SecurityScreen extends StatefulWidget {
  const SecurityScreen({super.key});

  @override
  State<SecurityScreen> createState() => _SecurityScreenState();
}

class _SecurityScreenState extends State<SecurityScreen> {
  bool _supported = false;
  bool _enabled = false;
  bool _loading = true;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _load();
  }

  Future<void> _load() async {
    final bool supported = await context.read<BiometricService>().isSupported();
    final bool enabled =
        await context.read<PreferencesRepository>().loadBiometricPreference();
    if (mounted) {
      setState(() {
        _supported = supported;
        _enabled = enabled;
        _loading = false;
      });
    }
  }

  Future<void> _toggle(bool next) async {
    if (next && !_supported) return;
    if (next) {
      final bool ok = await context.read<BiometricService>().authenticate(
            'Confirmez votre identité pour activer la biométrie KÓMBE.',
          );
      if (!ok || !mounted) return;
    }
    await context.read<PreferencesRepository>().saveBiometricPreference(next);
    if (mounted) setState(() => _enabled = next);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Sécurité')),
        body: _loading
            ? const Center(child: CircularProgressIndicator())
            : ListView(
                padding: const EdgeInsets.all(20),
                children: <Widget>[
                  SectionCard(
                    child: SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      secondary: const Icon(Icons.fingerprint),
                      title: const Text('Authentification biométrique'),
                      subtitle: Text(
                        _supported
                            ? 'Utilise la biométrie fournie par le système.'
                            : 'Indisponible sur cet appareil.',
                      ),
                      value: _enabled && _supported,
                      onChanged: _supported ? _toggle : null,
                    ),
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'KÓMBE ne lit ni ne stocke les gabarits biométriques. '
                    'La biométrie ne remplace pas l’autorisation serveur.',
                  ),
                ],
              ),
      );
}
