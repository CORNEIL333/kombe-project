import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/design/kombe_icons.g.dart';
import '../../core/design/kombe_theme.dart';
import '../../core/widgets/kombe_icon.dart';

/// Espace du bureau d'une tontine : les outils du président, du trésorier,
/// du secrétaire et du commissaire, réunis derrière l'icône « Bureau ».
/// Chaque action reste vérifiée par le serveur (fonctions et indépendance).
class BureauScreen extends StatelessWidget {
  const BureauScreen({required this.groupId, super.key});
  final String groupId;

  static const String _api = String.fromEnvironment('KOMBE_API_BASE_URL');

  Uri? get _tableauWeb {
    if (_api.isEmpty) return null;
    final Uri api = Uri.parse(_api);
    return api.replace(path: '${api.path.replaceFirst(RegExp(r'/v1/?$'), '')}/bureau/');
  }

  @override
  Widget build(BuildContext context) {
    final List<(String, String, String)> outils = <(String, String, String)>[
      (KombeIconData.validations, 'Validations', '/app/validations'),
      (KombeIconData.personnes, 'Membres', '/app/groups/$groupId/members'),
      (KombeIconData.inviter, 'Inviter', '/app/groups/$groupId/invite'),
      (KombeIconData.cagnotte, 'Caisses', '/app/groups/$groupId/funds'),
      (KombeIconData.cycle, 'Cycle', '/app/groups/$groupId/cycle'),
      (KombeIconData.groupes, 'Bénéficiaires', '/app/groups/$groupId/beneficiaries'),
      (KombeIconData.document, 'Règles', '/app/groups/$groupId/rules'),
      (KombeIconData.reglages, 'Paramètres', '/app/groups/$groupId/settings'),
      (KombeIconData.vote, 'Votes', '/app/votes'),
    ];
    final Uri? web = _tableauWeb;
    return Scaffold(
      appBar: AppBar(title: const Text('Bureau')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
        children: <Widget>[
          Row(
            children: <Widget>[
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(color: const Color(0xFFF8ECD2), borderRadius: BorderRadius.circular(16), border: Border.all(color: KombeColors.gold)),
                child: const Center(child: KombeIcon(KombeIconData.bureau, size: 26, color: Color(0xFF7A5410))),
              ),
              const SizedBox(width: 14),
              Expanded(child: Text('Les outils du bureau, vérifiés par le serveur.', style: Theme.of(context).textTheme.bodyMedium)),
            ],
          ),
          const SizedBox(height: 18),
          GridView.count(
            crossAxisCount: 3,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            childAspectRatio: .95,
            children: <Widget>[
              for (final (String icone, String libelle, String route) in outils)
                _Tuile(icone: icone, libelle: libelle, onTap: () => context.push(route)),
            ],
          ),
          if (web != null) ...<Widget>[
            const SizedBox(height: 22),
            Text('Tableau de bord complet', style: KombeType.titre(size: 18)),
            const SizedBox(height: 8),
            Material(
              color: Colors.white,
              borderRadius: BorderRadius.circular(18),
              child: InkWell(
                borderRadius: BorderRadius.circular(18),
                onTap: () => launchUrl(web, mode: LaunchMode.externalApplication),
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Row(
                    children: <Widget>[
                      const KombeIcon(KombeIconData.tableau, size: 24, color: KombeColors.forest),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text('Registre, exports et rapports du bureau dans le navigateur.', style: Theme.of(context).textTheme.bodyMedium),
                      ),
                      const KombeIcon(KombeIconData.fleche, size: 20, color: KombeColors.forest),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _Tuile extends StatelessWidget {
  const _Tuile({required this.icone, required this.libelle, required this.onTap});
  final String icone;
  final String libelle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
        button: true,
        label: libelle,
        child: Material(
          color: Colors.white,
          borderRadius: BorderRadius.circular(18),
          child: InkWell(
            borderRadius: BorderRadius.circular(18),
            onTap: onTap,
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: <Widget>[
                Container(
                  width: 46,
                  height: 46,
                  decoration: BoxDecoration(color: KombeColors.mint, borderRadius: BorderRadius.circular(14)),
                  child: Center(child: KombeIcon(icone, size: 24, color: KombeColors.emerald)),
                ),
                const SizedBox(height: 8),
                Text(libelle, maxLines: 1, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.labelMedium?.copyWith(color: KombeColors.ink)),
              ],
            ),
          ),
        ),
      );
}
