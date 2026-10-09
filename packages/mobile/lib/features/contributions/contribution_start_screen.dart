import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/widgets/status_ring.dart';
import '../../core/widgets/step_indicator.dart';
import '../../core/widgets/transparency_card.dart';
import '../../domain/entities/contribution.dart';
import '../../domain/repositories/draft_repository.dart';
import '../../l10n/app_localizations.dart';
import 'contribution_draft_view_model.dart';

class ContributionStartScreen extends StatefulWidget {
  const ContributionStartScreen({
    required this.groupId,
    super.key,
    this.draftId,
  });

  final String groupId;
  final String? draftId;

  @override
  State<ContributionStartScreen> createState() => _ContributionStartScreenState();
}

class _ContributionStartScreenState extends State<ContributionStartScreen> {
  final TextEditingController _amount = TextEditingController();
  final TextEditingController _note = TextEditingController();
  PaymentChannel _channel = PaymentChannel.mobileMoney;
  ContributionDraftViewModel? _vm;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_vm == null) {
      _vm = ContributionDraftViewModel(
        context.read<ContributionDraftRepository>(),
        widget.groupId,
        localId: widget.draftId,
      );
      _vm!.load().then((_) {
        final ContributionDraft? draft = _vm!.draft;
        if (draft != null && mounted) {
          setState(() {
            _amount.text = draft.amountXaf.toString();
            _note.text = draft.note ?? '';
            _channel = draft.channel;
          });
        }
      });
    }
  }

  @override
  void dispose() {
    _amount.dispose();
    _note.dispose();
    _vm?.dispose();
    super.dispose();
  }

  Future<void> _next() async {
    final ContributionDraft? draft = await _vm!.saveInformation(
      amountText: _amount.text,
      channel: _channel,
      note: _note.text,
    );
    if (!mounted) return;
    if (draft == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Saisissez un montant entier strictement positif.')),
      );
      return;
    }
    context.push(
      '/app/groups/${widget.groupId}/contributions/${draft.localId}/evidence',
    );
  }

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.declareContribution)),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: <Widget>[
            StepIndicator(
              current: 0,
              labels: <String>[l10n.information, l10n.evidence, l10n.review],
            ),
            const SizedBox(height: 26),
            Text(l10n.amount, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            TextField(
              controller: _amount,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                hintText: '0',
                suffixText: 'FCFA',
              ),
            ),
            const SizedBox(height: 20),
            Text(l10n.paymentMethod, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 10),
            for (final (PaymentChannel value, IconData icon, String label) in <(PaymentChannel, IconData, String)>[
              (PaymentChannel.mobileMoney, Icons.phone_android_rounded, l10n.mobileMoney),
              (PaymentChannel.bankTransfer, Icons.account_balance_outlined, l10n.bankTransfer),
              (PaymentChannel.cash, Icons.payments_outlined, l10n.cash),
            ])
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _ChannelOption(
                  icon: icon,
                  label: label,
                  selected: _channel == value,
                  onTap: () => setState(() => _channel = value),
                ),
              ),
            const SizedBox(height: 20),
            TextField(
              controller: _note,
              maxLines: 3,
              decoration: InputDecoration(labelText: l10n.noteOptional),
            ),
            const SizedBox(height: 16),
            const TransparencyCard(
              leading: KombeStatusRing(status: KombeStatus.draft, label: 'Brouillon sur cet appareil'),
              rows: <(String, String)>[
                ('Pour l''instant', 'Rien n''est envoyé au groupe. Aucun paiement n''est considéré comme reçu ou validé.'),
                ('Ensuite', 'Vous joindrez une preuve, puis vous relirez avant d''envoyer.'),
              ],
            ),
            const SizedBox(height: 24),
            FilledButton(onPressed: _next, child: Text(l10n.next)),
          ],
        ),
      ),
    );
  }
}

/// Choix du moyen de paiement : ligne pleine largeur (cible ≥ 56 px),
/// sélection marquée par l'anneau ET le contour, jamais la couleur seule.
class _ChannelOption extends StatelessWidget {
  const _ChannelOption({required this.icon, required this.label, required this.selected, required this.onTap});
  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
        inMutuallyExclusiveGroup: true,
        checked: selected,
        button: true,
        label: label,
        child: ExcludeSemantics(
          child: InkWell(
            borderRadius: BorderRadius.circular(14),
            onTap: onTap,
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 150),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              decoration: BoxDecoration(
                color: selected ? KombeColors.mint : Colors.white,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: selected ? KombeColors.emerald : KombeColors.lineStrong, width: selected ? 2 : 1.5),
              ),
              child: Row(
                children: <Widget>[
                  Icon(icon, color: selected ? KombeColors.forest : KombeColors.slate),
                  const SizedBox(width: 14),
                  Expanded(child: Text(label, style: Theme.of(context).textTheme.titleSmall)),
                  AnimatedContainer(
                    duration: const Duration(milliseconds: 150),
                    width: 22,
                    height: 22,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(color: selected ? KombeColors.forest : KombeColors.lineStrong, width: selected ? 7 : 2),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
}
