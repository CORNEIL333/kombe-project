import 'package:flutter/material.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/update/kombe_update.dart';
import '../../core/update/kombe_update_sheet.dart';
import '../../core/widgets/kombe_logo.dart';
import '../../core/widgets/section_card.dart';

class AboutScreen extends StatefulWidget {
  const AboutScreen({super.key});

  @override
  State<AboutScreen> createState() => _AboutScreenState();
}

class _AboutScreenState extends State<AboutScreen> {
  final KombeUpdater _updater = KombeUpdater();
  String _version = '—';
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    if (_updater.supported) {
      _updater.installed().then((InstalledVersion v) {
        if (mounted) setState(() => _version = '${v.name} (${v.build})');
      }).catchError((Object _) {});
    }
  }

  Future<void> _verifier() async {
    setState(() => _busy = true);
    await kombeCheckForUpdate(context, updater: _updater, manual: true);
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('À propos')),
        body: ListView(
          padding: const EdgeInsets.all(24),
          children: <Widget>[
            const Center(child: KombeLogo(size: 56)),
            const SizedBox(height: 28),
            SectionCard(
              child: Column(
                children: <Widget>[
                  ListTile(contentPadding: EdgeInsets.zero, title: const Text('Version installée'), trailing: Text(_version)),
                  const Divider(),
                  const ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text('Ce que fait KÓMBE'),
                    subtitle: Text(
                      'Le registre de votre tontine ou association : cotisations déclarées et confirmées, tours, caisses, '
                      'séances, statuts et votes, visibles par les membres.',
                    ),
                  ),
                  const Divider(),
                  const ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text('Ce que KÓMBE ne fait pas'),
                    subtitle: Text(
                      'KÓMBE ne garde pas l’argent et ne fait aucun paiement : l’argent passe entre les membres et le trésorier, '
                      'comme d’habitude.',
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 18),
            FilledButton.icon(
              key: const Key('maj-verifier'),
              onPressed: _busy ? null : _verifier,
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52), backgroundColor: KombeColors.forest),
              icon: _busy
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Icon(Icons.system_update_rounded),
              label: const Text('Rechercher une mise à jour'),
            ),
            const SizedBox(height: 12),
            Center(
              child: TextButton(
                onPressed: () => showLicensePage(context: context, applicationName: 'KÓMBE'),
                child: const Text('Licences des polices et bibliothèques'),
              ),
            ),
          ],
        ),
      );
}
