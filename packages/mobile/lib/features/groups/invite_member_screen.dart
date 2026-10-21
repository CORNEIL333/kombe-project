import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/formatters/douala_time.dart';
import '../../core/state/operation_result.dart';
import '../../core/widgets/operation_feedback.dart';
import '../../core/widgets/section_card.dart';
import '../../domain/entities/group.dart';
import '../../domain/repositories/group_repository.dart';

/// Lien `https://wa.me/?text=…` pour partager l'invitation sur WhatsApp ;
/// `null` si le lien construit n'est pas en https (jamais d'autre schéma).
Uri? whatsappShareUri(String text) {
  final Uri uri = Uri.https('wa.me', '/', <String, String>{'text': text});
  return uri.scheme == 'https' && uri.host == 'wa.me' ? uri : null;
}

/// Invitation de nouveaux membres : le serveur crée un lien et un code ; on
/// les partage (copie, WhatsApp). Aucun numéro de téléphone n'est demandé :
/// la personne rejoint avec le code, puis le bureau l'admet.
class InviteMemberScreen extends StatefulWidget {
  const InviteMemberScreen({required this.groupId, super.key});
  final String groupId;

  @override
  State<InviteMemberScreen> createState() => _InviteMemberScreenState();
}

class _InviteMemberScreenState extends State<InviteMemberScreen> {
  GroupInvitation? _invitation;
  bool _busy = false;

  Future<void> _create() async {
    setState(() => _busy = true);
    final OperationResult<GroupInvitation> r = await context.read<GroupRepository>().createInvitation(widget.groupId);
    if (!mounted) return;
    setState(() => _busy = false);
    if (r case OperationSuccess<GroupInvitation>(:final GroupInvitation value)) {
      setState(() => _invitation = value);
    } else {
      reportOutcome(context, r);
    }
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
    return Scaffold(
      appBar: AppBar(title: const Text('Inviter des membres')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: <Widget>[
            Text(
              'Créez un lien d’invitation et envoyez-le aux personnes à inviter. Elles ouvrent le lien (ou saisissent le code), '
              'puis le président ou le vice-président admet chaque demande.',
              style: t.bodyLarge,
            ),
            const SizedBox(height: 22),
            if (inv == null)
              FilledButton.icon(
                onPressed: _busy ? null : _create,
                icon: _busy
                    ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.link_rounded),
                label: const Text('Créer un lien d’invitation'),
              )
            else ...<Widget>[
              SectionCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text('Code', style: t.labelLarge),
                    const SizedBox(height: 4),
                    SelectableText(inv.code, style: t.headlineMedium?.copyWith(letterSpacing: 4, color: KombeColors.forest)),
                    const SizedBox(height: 14),
                    Text('Lien', style: t.labelLarge),
                    const SizedBox(height: 4),
                    SelectableText(inv.url, style: t.bodyMedium),
                    const SizedBox(height: 10),
                    Text(
                      'Valable jusqu’au ${DoualaTime.date(inv.expiresAtUtc)} · ${inv.maxUses} personnes au plus',
                      style: t.bodySmall,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              FilledButton.icon(
                onPressed: () => _shareWhatsApp(inv),
                icon: const Icon(Icons.chat_outlined),
                label: const Text('Partager sur WhatsApp'),
              ),
              const SizedBox(height: 10),
              Row(
                children: <Widget>[
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => _copy(inv.url, 'Lien'),
                      icon: const Icon(Icons.copy_rounded),
                      label: const Text('Copier le lien'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => _copy(inv.code, 'Code'),
                      icon: const Icon(Icons.copy_rounded),
                      label: const Text('Copier le code'),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}
