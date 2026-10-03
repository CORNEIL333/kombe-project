import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/widgets/step_indicator.dart';
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
            SegmentedButton<PaymentChannel>(
              segments: <ButtonSegment<PaymentChannel>>[
                ButtonSegment<PaymentChannel>(
                  value: PaymentChannel.mobileMoney,
                  icon: const Icon(Icons.phone_android),
                  label: Text(l10n.mobileMoney),
                ),
                ButtonSegment<PaymentChannel>(
                  value: PaymentChannel.bankTransfer,
                  icon: const Icon(Icons.account_balance_outlined),
                  label: Text(l10n.bankTransfer),
                ),
                ButtonSegment<PaymentChannel>(
                  value: PaymentChannel.cash,
                  icon: const Icon(Icons.payments_outlined),
                  label: Text(l10n.cash),
                ),
              ],
              selected: <PaymentChannel>{_channel},
              onSelectionChanged: (Set<PaymentChannel> value) {
                setState(() => _channel = value.single);
              },
              showSelectedIcon: false,
            ),
            const SizedBox(height: 20),
            TextField(
              controller: _note,
              maxLines: 3,
              decoration: InputDecoration(labelText: l10n.noteOptional),
            ),
            const SizedBox(height: 16),
            DecoratedBox(
              decoration: BoxDecoration(
                color: KombeColors.mint,
                borderRadius: BorderRadius.circular(16),
              ),
              child: const Padding(
                padding: EdgeInsets.all(16),
                child: Row(
                  children: <Widget>[
                    Icon(Icons.info_outline, color: KombeColors.forest),
                    SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        'Cet écran crée uniquement un brouillon local. Aucun paiement n’est considéré comme reçu ou validé.',
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),
            FilledButton(onPressed: _next, child: Text(l10n.next)),
          ],
        ),
      ),
    );
  }
}
