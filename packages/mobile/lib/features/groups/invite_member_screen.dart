import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/design/kombe_spacing.dart';
import '../../core/design/kombe_theme.dart';
import '../../core/state/operation_result.dart';
import '../../core/widgets/kombe_components.dart';
import '../../core/widgets/kombe_sheet.dart';
import '../../domain/entities/group.dart';
import '../../domain/repositories/group_repository.dart';
import '../auth/auth_validators.dart';

/// Ouvre l'invitation en demi-fenêtre, sans quitter l'écran du groupe.
Future<void> showInviteSheet(BuildContext context, String groupId) =>
    showKombeSheet<void>(context, title: 'Inviter un membre', builder: (_) => InvitePanel(groupId: groupId));

/// Route directe (`/app/groups/:id/invite`) : même contenu en plein écran.
class InviteMemberScreen extends StatelessWidget {
  const InviteMemberScreen({required this.groupId, super.key});
  final String groupId;

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Inviter un membre')),
        body: SafeArea(
          child: SingleChildScrollView(padding: const EdgeInsets.all(20), child: InvitePanel(groupId: groupId)),
        ),
      );
}

/// Créer une invitation (action réelle, écrite au registre) puis la partager.
/// Le numéro est facultatif : il sert seulement à ouvrir WhatsApp sur la
/// bonne conversation. KÓMBE n'envoie aucun message en votre nom.
class InvitePanel extends StatefulWidget {
  const InvitePanel({required this.groupId, super.key});
  final String groupId;

  @override
  State<InvitePanel> createState() => _InvitePanelState();
}

class _InvitePanelState extends State<InvitePanel> {
  final TextEditingController _phone = TextEditingController();
  GroupInvitation? _invitation;
  bool _creating = false;
  String? _error;

  @override
  void dispose() {
    _phone.dispose();
    super.dispose();
  }

  Future<void> _create() async {
    if (_creating) return;
    setState(() {
      _creating = true;
      _error = null;
    });
    final OperationResult<GroupInvitation> r = await context.read<GroupRepository>().createInvitation(widget.groupId);
    if (!mounted) return;
    setState(() {
      _creating = false;
      switch (r) {
        case OperationSuccess<GroupInvitation>(:final GroupInvitation value):
          _invitation = value;
        case OperationFailure<GroupInvitation>(:final Object error):
          _error = '$error';
        case OperationBlocked<GroupInvitation>():
          _error = 'L’invitation ne peut pas être créée depuis cette version de l’application.';
      }
    });
  }

  Future<void> _copy(String text, String what) async {
    await Clipboard.setData(ClipboardData(text: text));
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$what copié.')));
  }

  Future<void> _whatsApp(GroupInvitation inv) async {
    final String digits = _phone.text.replaceAll(RegExp(r'\D'), '');
    final String to = AuthValidators.isCameroonLocalPhone(digits) ? '237$digits' : '';
    final Uri uri = Uri.parse('https://wa.me/$to?text=${Uri.encodeComponent(inv.shareText)}');
    final bool ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('WhatsApp n’a pas pu s’ouvrir. Copiez le lien et envoyez-le vous-même.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    final GroupInvitation? inv = _invitation;
    if (inv == null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Text(
            'Créez un lien à usage unique, valable 14 jours. La personne le reçoit de votre part '
            'et rejoint le groupe ; le bureau valide ensuite son adhésion.',
            style: t.bodyMedium,
          ),
          if (_error != null) ...<Widget>[
            const SizedBox(height: 12),
            KombeInlineError(_error!),
          ],
          const SizedBox(height: 18),
          FilledButton(
            onPressed: _creating ? null : _create,
            child: _creating
                ? const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2.4))
                : const Text('Créer le lien d’invitation'),
          ),
        ],
      );
    }
    final DateTime exp = inv.expiresAtUtc.toLocal();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        // Le code, comme un ticket : c'est ce qu'on transmet de vive voix.
        Container(
          padding: const EdgeInsets.fromLTRB(16, 12, 6, 12),
          decoration: BoxDecoration(color: KombeColors.mint, borderRadius: BorderRadius.circular(KombeSpacing.tileRadius)),
          child: Row(
            children: <Widget>[
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    const Text('CODE D’INVITATION', style: KombeType.eyebrow),
                    const SizedBox(height: 4),
                    SelectableText(inv.code, style: KombeType.amount(size: 28).copyWith(letterSpacing: 3)),
                  ],
                ),
              ),
              IconButton(tooltip: 'Copier le code', onPressed: () => _copy(inv.code, 'Code'), icon: const Icon(Icons.copy_rounded)),
            ],
          ),
        ),
        const SizedBox(height: 8),
        Text(
          'Valable jusqu’au ${exp.day.toString().padLeft(2, '0')}/${exp.month.toString().padLeft(2, '0')}/${exp.year}, pour une personne.',
          style: t.bodySmall,
        ),
        const SizedBox(height: 18),
        TextField(
          controller: _phone,
          keyboardType: TextInputType.phone,
          decoration: const InputDecoration(
            labelText: 'Numéro WhatsApp (facultatif)',
            prefixText: '+237 ',
            helperText: 'Pour ouvrir directement la conversation.',
          ),
        ),
        const SizedBox(height: 14),
        FilledButton.icon(
          onPressed: () => _whatsApp(inv),
          icon: const Icon(Icons.chat_rounded),
          label: const Text('Envoyer par WhatsApp'),
        ),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          onPressed: () => _copy(inv.url, 'Lien'),
          icon: const Icon(Icons.link_rounded),
          label: const Text('Copier le lien'),
        ),
      ],
    );
  }
}
