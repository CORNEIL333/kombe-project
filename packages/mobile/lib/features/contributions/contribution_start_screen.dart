import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/formatters/xaf.dart';
import '../../core/state/resource.dart';
import '../../core/widgets/kombe_visuals.dart';
import '../../core/widgets/step_indicator.dart';
import '../../domain/entities/contribution.dart';
import '../../domain/entities/group.dart';
import '../../domain/repositories/draft_repository.dart';
import '../../domain/repositories/group_repository.dart';
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
  Future<Resource<GroupDetails>>? _group;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_vm == null) {
      _group = context.read<GroupRepository>().getGroup(widget.groupId);
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
    final TextTheme t = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(
        centerTitle: true,
        title: Text(l10n.declareContribution, style: t.titleLarge?.copyWith(fontFamily: 'Fraunces', fontWeight: FontWeight.w600, fontSize: 22)),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
          children: <Widget>[
            StepIndicator(
              current: 0,
              labels: <String>[l10n.information, l10n.evidence, 'Confirmation'],
            ),
            const SizedBox(height: 20),
            FutureBuilder<Resource<GroupDetails>>(
              future: _group,
              builder: (BuildContext context, AsyncSnapshot<Resource<GroupDetails>> snap) => switch (snap.data) {
                ResourceReady<GroupDetails>(:final GroupDetails data) => _GroupSummaryCard(group: data.summary),
                _ => const SizedBox.shrink(),
              },
            ),
            const SizedBox(height: 18),
            const _Label(text: 'Montant versé'),
            const SizedBox(height: 8),
            TextField(
              controller: _amount,
              keyboardType: TextInputType.number,
              style: t.titleMedium?.copyWith(fontSize: 18, fontWeight: FontWeight.w600),
              decoration: const InputDecoration(hintText: '0', suffixText: 'FCFA'),
            ),
            const SizedBox(height: 18),
            _Label(text: l10n.paymentMethod),
            const SizedBox(height: 10),
            Row(
              children: <Widget>[
                for (final (PaymentChannel value, IconData icon, String label) in <(PaymentChannel, IconData, String)>[
                  (PaymentChannel.mobileMoney, Icons.phone_android_rounded, l10n.mobileMoney),
                  (PaymentChannel.bankTransfer, Icons.account_balance_outlined, l10n.bankTransfer),
                  (PaymentChannel.cash, Icons.payments_outlined, l10n.cash),
                ])
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      child: _ChannelTile(
                        icon: icon,
                        label: label,
                        selected: _channel == value,
                        onTap: () => setState(() => _channel = value),
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 18),
            Text.rich(TextSpan(children: <InlineSpan>[
              TextSpan(text: 'Note ', style: t.titleSmall?.copyWith(fontSize: 15)),
              TextSpan(text: '(optionnelle)', style: t.bodyMedium),
            ])),
            const SizedBox(height: 8),
            TextField(
              controller: _note,
              maxLines: 3,
              decoration: const InputDecoration(hintText: 'Ajouter un commentaire…'),
            ),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(color: KombeColors.mint, borderRadius: BorderRadius.circular(16)),
              child: Row(
                children: <Widget>[
                  const Icon(Icons.verified_user_outlined, color: KombeColors.forest, size: 28),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'Rien n’est envoyé à cette étape. Après envoi, votre déclaration sera vérifiée par un membre autorisé du groupe.',
                      style: t.bodySmall?.copyWith(color: KombeColors.ink),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: _next,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: <Widget>[Text(l10n.next), const SizedBox(width: 10), const Icon(Icons.arrow_forward_rounded)],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Label extends StatelessWidget {
  const _Label({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) => Text.rich(TextSpan(children: <InlineSpan>[
        TextSpan(text: text, style: Theme.of(context).textTheme.titleSmall?.copyWith(fontSize: 15)),
        const TextSpan(text: ' *', style: TextStyle(color: KombeColors.danger, fontWeight: FontWeight.w800)),
      ]));
}

/// Carte du groupe concerné (maquette) : couverture, nom, cycle, montant par membre.
class _GroupSummaryCard extends StatelessWidget {
  const _GroupSummaryCard({required this.group});
  final GroupSummary group;

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(18), border: Border.all(color: KombeColors.line)),
      child: Row(
        children: <Widget>[
          CoverImage(groupId: group.id, url: group.coverUrl, width: 76, height: 76, radius: 14),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(group.name, style: t.titleMedium?.copyWith(fontSize: 17)),
                const SizedBox(height: 6),
                KombeChip(label: 'Cycle ${group.cycleIndex}/${group.cycleTotal}', tone: ChipTone.neutral),
                const SizedBox(height: 6),
                Text.rich(TextSpan(children: <InlineSpan>[
                  TextSpan(text: Xaf.format(group.contributionAmountXaf), style: t.titleSmall),
                  TextSpan(text: ' par membre', style: t.bodySmall),
                ])),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Tuile de moyen de paiement (maquette : trois tuiles côte à côte).
/// Sélection = contour vert + fond menthe, annoncée aux lecteurs d'écran.
class _ChannelTile extends StatelessWidget {
  const _ChannelTile({required this.icon, required this.label, required this.selected, required this.onTap});
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
              height: 92,
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 10),
              decoration: BoxDecoration(
                color: selected ? KombeColors.mint : Colors.white,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: selected ? KombeColors.forest : KombeColors.lineStrong, width: selected ? 2 : 1.2),
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: <Widget>[
                  Icon(icon, color: KombeColors.forest, size: 28),
                  const SizedBox(height: 8),
                  Text(
                    label,
                    textAlign: TextAlign.center,
                    maxLines: 2,
                    style: TextStyle(fontSize: 12.5, height: 1.15, fontWeight: selected ? FontWeight.w700 : FontWeight.w500, color: KombeColors.ink),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
}
