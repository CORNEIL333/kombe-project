import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/design/kombe_spacing.dart';
import '../../core/design/kombe_theme.dart';
import '../../core/formatters/douala_time.dart';
import '../../core/state/operation_result.dart';
import '../../core/widgets/kombe_components.dart';
import '../../core/widgets/kombe_sheet.dart';
import '../../core/widgets/operation_feedback.dart';
import '../../domain/entities/group.dart';
import '../../domain/repositories/group_repository.dart';

/// Lien `https://wa.me/?text=…` pour partager l'invitation sur WhatsApp ;
/// `null` si le lien construit n'est pas en https (jamais d'autre schéma).
Uri? whatsappShareUri(String text) {
  final Uri uri = Uri.https('wa.me', '/', <String, String>{'text': text});
  return uri.scheme == 'https' && uri.host == 'wa.me' ? uri : null;
}

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

/// Invitation de nouveaux membres : le serveur crée un lien et un code
/// (action réelle, écrite au registre) ; on les partage (copie, WhatsApp).
/// Aucun numéro de téléphone n'est demandé et KÓMBE n'envoie aucun message
/// en votre nom : la personne rejoint avec le code, puis le bureau l'admet.
class InvitePanel extends StatefulWidget {
  const InvitePanel({required this.groupId, super.key});
  final String groupId;

  @override
  State<InvitePanel> createState() => _InvitePanelState();
}

class _InvitePanelState extends State<InvitePanel> {
  GroupInvitation? _invitation;
  bool _creating = false;
  String? _error;

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
      if (r case OperationSuccess<GroupInvitation>(:final GroupInvitation value)) {
        _invitation = value;
      } else {
        _error = outcomeMessage(r);
      }
    });
  }

  Future<void> _copy(String text, String what) async {
    await Clipboard.setData(ClipboardData(text: text));
    if (mounted) showKombeMessage(context, '$what copié.');
  }

  Future<void> _shareWhatsApp(GroupInvitation inv) async {
    final String text = inv.whatsappText.isNotEmpty ? inv.whatsappText : 'Rejoins notre tontine sur KÓMBE : ${inv.url} (code ${inv.code})';
    final Uri? uri = whatsappShareUri(text);
    if (uri == null) return;
    final bool ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && mounted) {
      showKombeMessage(context, 'WhatsApp n’a pas pu s’ouvrir : copiez le lien et envoyez-le vous-même.');
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
            'Créez un lien d’invitation, valable 14 jours, et envoyez-le à la personne à inviter. Elle ouvre le lien '
            '(ou saisit le code), puis le président ou le vice-président admet sa demande.',
            style: t.bodyMedium,
          ),
          if (_error != null) ...<Widget>[
            const SizedBox(height: 12),
            KombeInlineError(_error!),
          ],
          const SizedBox(height: 18),
          FilledButton.icon(
            onPressed: _creating ? null : _create,
            icon: _creating
                ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2.4))
                : const Icon(Icons.link_rounded),
            label: const Text('Créer un lien d’invitation'),
          ),
        ],
      );
    }
    final String uses = inv.maxUses <= 1 ? 'pour une personne' : '${inv.maxUses} personnes au plus';
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
        const SizedBox(height: 14),
        const Text('LIEN', style: KombeType.eyebrow),
        const SizedBox(height: 4),
        SelectableText(inv.url, style: t.bodyMedium),
        const SizedBox(height: 8),
        Text(
          'Valable jusqu’au ${DoualaTime.date(inv.expiresAtUtc)}, $uses.',
          style: t.bodySmall?.copyWith(color: KombeColors.slate),
        ),
        const SizedBox(height: 18),
        FilledButton.icon(
          onPressed: () => _shareWhatsApp(inv),
          icon: const Icon(Icons.chat_rounded),
          label: const Text('Partager sur WhatsApp'),
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
