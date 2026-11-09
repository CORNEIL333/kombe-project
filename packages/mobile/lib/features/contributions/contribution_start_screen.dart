import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/design/kombe_spacing.dart';
import '../../core/design/kombe_theme.dart';
import '../../core/formatters/xaf.dart';
import '../../core/state/resource.dart';
import '../../core/widgets/kombe_components.dart';
import '../../core/widgets/kombe_sheet.dart';
import '../../domain/entities/contribution.dart';
import '../../domain/repositories/contribution_repository.dart';
import '../../domain/repositories/draft_repository.dart';
import '../../l10n/app_localizations.dart';
import 'contribution_draft_view_model.dart';
import 'contribution_sent_sheet.dart';

/// Déclarer un versement fait hors de l'application (Mobile Money, virement,
/// espèces). Un seul écran : ce qui reste à régler, le montant (proposé,
/// modifiable, jamais au-delà du dû), le moyen et sa référence. Le
/// récapitulatif s'ouvre en demi-fenêtre : on vérifie puis on envoie sans
/// perdre la saisie. KÓMBE ne déplace pas d'argent : il enregistre la
/// déclaration, que la trésorerie confirme.
class ContributionStartScreen extends StatefulWidget {
  const ContributionStartScreen({required this.groupId, super.key, this.draftId});

  final String groupId;
  final String? draftId;

  @override
  State<ContributionStartScreen> createState() => _ContributionStartScreenState();
}

class _ContributionStartScreenState extends State<ContributionStartScreen> {
  final TextEditingController _amount = TextEditingController();
  final TextEditingController _reference = TextEditingController();
  final TextEditingController _reason = TextEditingController();
  PaymentChannel _channel = PaymentChannel.orangeMoney;
  final GlobalKey _amountKey = GlobalKey();
  final GlobalKey _referenceKey = GlobalKey();
  final GlobalKey _reasonKey = GlobalKey();
  bool _noReference = false;
  bool _showErrors = false;
  late final ContributionDraftViewModel _vm;

  @override
  void initState() {
    super.initState();
    _vm = ContributionDraftViewModel(
      context.read<ContributionDraftRepository>(),
      context.read<ContributionRepository>(),
      widget.groupId,
      localId: widget.draftId,
    );
    _vm.addListener(_onVm);
    _vm.load().then((_) {
      if (!mounted) return;
      final ContributionDraft? d = _vm.draft;
      setState(() {
        if (d != null) {
          _amount.text = d.amountXaf > 0 ? '${d.amountXaf}' : '';
          _channel = d.channel;
          _reference.text = d.reference ?? '';
          _reason.text = d.noReferenceReason ?? '';
          _noReference = d.reference == null && d.noReferenceReason != null;
        } else if (_vm.maxXaf > 0) {
          // Proposé : tout ce qui reste dû. Modifiable.
          _amount.text = '${_vm.maxXaf}';
        }
      });
      _save();
      // Envoi interrompu : on reprend là où il s'était arrêté.
      if (_vm.locked) _openReview();
    });
  }

  void _onVm() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _vm.removeListener(_onVm);
    _vm.dispose();
    _amount.dispose();
    _reference.dispose();
    _reason.dispose();
    super.dispose();
  }

  bool get _needsReference => _channel != PaymentChannel.cash;

  void _save() => _vm.edit(
    amountXaf: ContributionDraftViewModel.parseAmount(_amount.text),
    channel: _channel,
    reference: _needsReference && !_noReference ? _reference.text : null,
    reason: _needsReference && _noReference ? _reason.text : null,
  );

  String? get _amountError {
    final int? v = ContributionDraftViewModel.parseAmount(_amount.text);
    if (v == null) return 'Saisissez un montant entier en FCFA.';
    if (v > _vm.maxXaf) return 'Au maximum ${Xaf.format(_vm.maxXaf)} : c’est ce qui reste à régler.';
    return null;
  }

  String? get _referenceError {
    if (!_needsReference || _noReference) return null;
    final String r = _reference.text.trim();
    if (r.isEmpty) return 'Saisissez la référence reçue de l’opérateur ou de la banque.';
    if (!isValidTransactionReference(r)) return 'Lettres, chiffres et . - _ / uniquement (64 caractères au plus).';
    return null;
  }

  String? get _reasonError => _needsReference && _noReference && _reason.text.trim().isEmpty ? 'Expliquez pourquoi il n’y a pas de référence.' : null;

  bool get _valid => _amountError == null && _referenceError == null && _reasonError == null;

  void _review() {
    _save();
    if (!_valid) {
      setState(() => _showErrors = true);
      // Le champ en erreur peut être hors écran (petit téléphone, clavier) :
      // on l'amène sous les yeux, sinon « Vérifier » semblerait ne rien faire.
      final GlobalKey target = _amountError != null ? _amountKey : (_referenceError != null ? _referenceKey : _reasonKey);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        final BuildContext? c = target.currentContext;
        if (c != null && c.mounted) {
          unawaited(Scrollable.ensureVisible(c, duration: const Duration(milliseconds: 250), curve: Curves.easeOut, alignment: .2));
        }
      });
      return;
    }
    _openReview();
  }

  Future<void> _openReview() async {
    await showKombeSheet<void>(
      context,
      title: 'Vérifier et envoyer',
      dismissible: true,
      builder: (_) => _ReviewSheet(vm: _vm, channelLabel: _channelLabel(AppLocalizations.of(context), _vm.draft?.channel ?? _channel)),
    );
    if (!mounted) return;
    if (_vm.phase == DeclarationPhase.done) {
      await showContributionSentSheet(context);
      if (mounted) context.go('/app');
    } else {
      _vm.backToEditing();
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final TextTheme t = Theme.of(context).textTheme;
    final bool locked = _vm.locked;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.declareContribution)),
      body: SafeArea(
        child: switch (_vm.dues) {
          ResourceLoading<List<OpenDue>>() => const KombeListSkeleton(rows: 3),
          ResourceReady<List<OpenDue>>(:final List<OpenDue> data) when data.isEmpty && !locked => _NothingDue(onBack: () => context.pop()),
          ResourceFailure<List<OpenDue>>(:final Object error) when !locked => _LoadError(message: '$error', onRetry: () => _vm.load()),
          ResourceUnavailable<List<OpenDue>>() when !locked => _LoadError(message: l10n.serviceUnavailableBody, onRetry: () => _vm.load()),
          _ => SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 120),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                if (_vm.dues case ResourceReady<List<OpenDue>>(:final List<OpenDue> data)) _DueSummary(dues: data),
                const SizedBox(height: 20),
                if (locked)
                  const _LockedNotice()
                else ...<Widget>[
                  TextField(
                    key: _amountKey,
                    controller: _amount,
                    keyboardType: TextInputType.number,
                    textInputAction: TextInputAction.next,
                    style: KombeType.amount(size: 26),
                    decoration: InputDecoration(labelText: 'Montant versé', suffixText: 'FCFA', errorText: _showErrors ? _amountError : null),
                    onChanged: (_) => setState(_save),
                  ),
                  const SizedBox(height: 22),
                  Text(l10n.paymentMethod, style: t.titleSmall),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: <Widget>[
                      for (final PaymentChannel c in const <PaymentChannel>[
                        PaymentChannel.orangeMoney,
                        PaymentChannel.mtnMomo,
                        PaymentChannel.bankTransfer,
                        PaymentChannel.internationalTransfer,
                        PaymentChannel.cash,
                      ])
                        ChoiceChip(
                          label: Text(_channelLabel(l10n, c)),
                          selected: _channel == c,
                          onSelected: (_) => setState(() {
                            _channel = c;
                            _save();
                          }),
                        ),
                    ],
                  ),
                  if (_needsReference) ...<Widget>[
                    const SizedBox(height: 22),
                    if (!_noReference)
                      TextField(
                        key: _referenceKey,
                        controller: _reference,
                        textCapitalization: TextCapitalization.characters,
                        autocorrect: false,
                        maxLength: 64,
                        decoration: InputDecoration(
                          labelText: 'Référence de la transaction',
                          helperText: 'Le code du SMS de confirmation de l’opérateur ou de la banque.',
                          helperMaxLines: 2,
                          errorText: _showErrors ? _referenceError : null,
                        ),
                        onChanged: (_) => setState(_save),
                      )
                    else
                      TextField(
                        key: _reasonKey,
                        controller: _reason,
                        maxLength: 500,
                        maxLines: 2,
                        decoration: InputDecoration(
                          labelText: 'Pourquoi pas de référence ?',
                          helperText: 'Par exemple : SMS de confirmation non reçu.',
                          helperMaxLines: 2,
                          errorText: _showErrors ? _reasonError : null,
                        ),
                        onChanged: (_) => setState(_save),
                      ),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: TextButton(
                        onPressed: () => setState(() {
                          _noReference = !_noReference;
                          _save();
                        }),
                        child: Text(_noReference ? 'J’ai une référence' : 'Je n’ai pas de référence'),
                      ),
                    ),
                  ],
                  const SizedBox(height: 8),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      const Icon(Icons.photo_camera_outlined, size: 20, color: KombeColors.slate),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          'Gardez votre reçu.',
                          style: t.bodySmall?.copyWith(color: KombeColors.slate),
                        ),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        },
      ),
      bottomNavigationBar: _vm.dues is ResourceReady<List<OpenDue>> && ((_vm.dues as ResourceReady<List<OpenDue>>).data.isNotEmpty || locked)
          ? SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
                child: FilledButton(onPressed: locked ? _openReview : _review, child: Text(locked ? 'Reprendre l’envoi' : 'Vérifier')),
              ),
            )
          : null,
    );
  }
}

String _channelLabel(AppLocalizations l10n, PaymentChannel c) => switch (c) {
  PaymentChannel.orangeMoney => l10n.orangeMoney,
  PaymentChannel.mtnMomo => l10n.mtnMomo,
  PaymentChannel.bankTransfer => l10n.bankTransfer,
  // Libellé court (puce) ; le montant déclaré est celui reçu en FCFA.
  PaymentChannel.internationalTransfer => 'Transfert international',
  PaymentChannel.cash => l10n.cash,
  PaymentChannel.mobileMoney => 'Mobile Money',
};

/// Ce qui reste à régler, caisse par caisse, tour par tour.
class _DueSummary extends StatelessWidget {
  const _DueSummary({required this.dues});
  final List<OpenDue> dues;

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    final int total = dues.fold<int>(0, (int s, OpenDue d) => s + d.remainingXaf);
    return KombeCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text('Reste à régler', style: t.bodyMedium),
          const SizedBox(height: 2),
          FittedBox(fit: BoxFit.scaleDown, alignment: Alignment.centerLeft, child: KombeAmount(total, size: 32)),
          const SizedBox(height: 10),
          const Divider(),
          const SizedBox(height: 6),
          for (final OpenDue d in dues)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                children: <Widget>[
                  Expanded(child: Text('${d.fundName} · tour ${d.roundSeq}', style: t.bodyMedium)),
                  if (d.late)
                    const Padding(
                      padding: EdgeInsets.only(right: 8),
                      child: StatusPill('en retard', tone: KombeTone.danger),
                    ),
                  Text(Xaf.format(d.remainingXaf), style: KombeType.amount(size: 15, color: KombeColors.ink)),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _LockedNotice extends StatelessWidget {
  const _LockedNotice();

  @override
  Widget build(BuildContext context) => Text(
    'L’envoi a commencé. Reprenez-le : rien ne sera envoyé deux fois.',
    style: Theme.of(context).textTheme.bodyLarge,
  );
}

class _NothingDue extends StatelessWidget {
  const _NothingDue({required this.onBack});
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          const Icon(Icons.check_circle_outline_rounded, size: 48, color: KombeColors.forest),
          const SizedBox(height: 12),
          Text('Rien à régler pour le moment', style: Theme.of(context).textTheme.titleMedium, textAlign: TextAlign.center),
          const SizedBox(height: 6),
          const Text('Tout est payé.', textAlign: TextAlign.center),
          const SizedBox(height: 16),
          OutlinedButton(onPressed: onBack, child: const Text('Retour')),
        ],
      ),
    ),
  );
}

class _LoadError extends StatelessWidget {
  const _LoadError({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Text(message, textAlign: TextAlign.center),
          const SizedBox(height: 12),
          OutlinedButton(onPressed: onRetry, child: const Text('Réessayer')),
        ],
      ),
    ),
  );
}

/// Récapitulatif + envoi + issue réelle, dans la même demi-fenêtre.
class _ReviewSheet extends StatelessWidget {
  const _ReviewSheet({required this.vm, required this.channelLabel});
  final ContributionDraftViewModel vm;
  final String channelLabel;

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: vm,
    builder: (BuildContext context, _) {
      final TextTheme t = Theme.of(context).textTheme;
      final ContributionDraft? d = vm.draft;
      List<DeclarationLine> lines;
      try {
        lines = vm.preview();
      } on AmountExceedsDue {
        lines = const <DeclarationLine>[];
      }
      if (vm.phase == DeclarationPhase.done) {
        WidgetsBinding.instance.addPostFrameCallback((_) => Navigator.of(context).maybePop());
      }
      final bool sending = vm.phase == DeclarationPhase.sending;
      final DeclarationReceipt? r = vm.receipt;
      return PopScope(
        canPop: !sending,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            for (final DeclarationLine l in lines)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Row(
                  children: <Widget>[
                    Icon(
                      l.recorded ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded,
                      size: 20,
                      color: l.recorded ? KombeColors.forest : KombeColors.slate,
                      semanticLabel: l.recorded ? 'enregistrée' : 'à envoyer',
                    ),
                    const SizedBox(width: 10),
                    Expanded(child: Text('${l.fundName} · tour ${l.roundSeq}', style: t.bodyLarge)),
                    Text(Xaf.format(l.amountXaf), style: KombeType.amount(size: 17)),
                  ],
                ),
              ),
            const Divider(height: 24),
            _kv(t, 'Moyen', channelLabel),
            if (d?.reference != null) _kv(t, 'Référence', d!.reference!),
            if (d?.reference == null && d?.noReferenceReason != null) _kv(t, 'Sans référence', d!.noReferenceReason!),
            const SizedBox(height: 14),
            if (r != null && vm.phase != DeclarationPhase.editing && vm.phase != DeclarationPhase.sending)
              _Outcome(phase: vm.phase, receipt: r)
            else
              Text(
                'La trésorerie confirmera ce paiement.',
                style: t.bodySmall?.copyWith(color: KombeColors.slate),
              ),
            const SizedBox(height: 16),
            if (vm.phase == DeclarationPhase.failed)
              OutlinedButton(onPressed: () => Navigator.of(context).maybePop(), child: const Text('Modifier la saisie'))
            else
              FilledButton(
                onPressed: sending || lines.isEmpty ? null : vm.send,
                child: sending
                    ? const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2.4))
                    : Text(d?.sending ?? false ? 'Reprendre l’envoi' : 'Envoyer'),
              ),
          ],
        ),
      );
    },
  );

  Widget _kv(TextTheme t, String k, String v) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 3),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        SizedBox(
          width: 120,
          child: Text(k, style: t.bodyMedium?.copyWith(color: KombeColors.slate)),
        ),
        Expanded(child: Text(v, style: t.bodyMedium)),
      ],
    ),
  );
}

/// Ce qui s'est passé, ce que cela signifie, ce que l'on peut faire.
class _Outcome extends StatelessWidget {
  const _Outcome({required this.phase, required this.receipt});
  final DeclarationPhase phase;
  final DeclarationReceipt receipt;

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    final (String title, String body) = switch (phase) {
      DeclarationPhase.unknown => (
        'Réponse non reçue',
        'Le réseau a coupé. Reprenez l’envoi : rien ne sera compté deux fois.',
      ),
      DeclarationPhase.partial => (
        '${receipt.recordedCount} sur ${receipt.lines.length} enregistrées',
        'Les lignes cochées sont enregistrées. ${receipt.error ?? ''} '
            'Reprenez l’envoi pour terminer ; le brouillon est gardé sur ce téléphone.',
      ),
      _ => ('Paiement non enregistré', '${receipt.error ?? ''} Rien n’a été enregistré : corrigez puis renvoyez.'),
    };
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: phase == DeclarationPhase.failed ? KombeTone.danger.bg : KombeColors.mint,
          borderRadius: BorderRadius.circular(KombeSpacing.tileRadius),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(title, style: t.titleSmall),
            const SizedBox(height: 4),
            Text(body.replaceAll(RegExp(r'\s+'), ' ').trim(), style: t.bodyMedium),
          ],
        ),
      ),
    );
  }
}
