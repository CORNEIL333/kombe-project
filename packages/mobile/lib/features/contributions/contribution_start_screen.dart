import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/formatters/xaf.dart';
import '../../core/state/resource.dart';
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

  String? get _reasonError =>
      _needsReference && _noReference && _reason.text.trim().isEmpty ? 'Expliquez pourquoi il n’y a pas de référence.' : null;

  bool get _valid => _amountError == null && _referenceError == null && _reasonError == null;

  void _review() {
    _save();
    if (!_valid) {
      setState(() => _showErrors = true);
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
          ResourceLoading<List<OpenDue>>() => const Center(child: CircularProgressIndicator()),
          ResourceReady<List<OpenDue>>(:final List<OpenDue> data) when data.isEmpty && !locked => _NothingDue(onBack: () => context.pop()),
          ResourceFailure<List<OpenDue>>(:final Object error) when !locked => _LoadError(message: '$error', onRetry: () => _vm.load()),
          ResourceUnavailable<List<OpenDue>>() when !locked => _LoadError(message: l10n.serviceUnavailableBody, onRetry: () => _vm.load()),
          _ => ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 120),
              children: <Widget>[
                if (_vm.dues case ResourceReady<List<OpenDue>>(:final List<OpenDue> data)) _DueSummary(dues: data),
                const SizedBox(height: 20),
                if (locked)
                  const _LockedNotice()
                else ...<Widget>[
                  TextField(
                    controller: _amount,
                    keyboardType: TextInputType.number,
                    textInputAction: TextInputAction.next,
                    style: t.headlineSmall?.copyWith(fontWeight: FontWeight.w700),
                    decoration: InputDecoration(
                      labelText: 'Montant versé',
                      suffixText: 'FCFA',
                      errorText: _showErrors ? _amountError : null,
                    ),
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
                        controller: _reference,
                        textCapitalization: TextCapitalization.characters,
                        autocorrect: false,
                        maxLength: 64,
                        decoration: InputDecoration(
                          labelText: 'Référence de la transaction',
                          helperText: 'Le code du SMS de confirmation de l’opérateur ou de la banque.',
                          errorText: _showErrors ? _referenceError : null,
                        ),
                        onChanged: (_) => setState(_save),
                      )
                    else
                      TextField(
                        controller: _reason,
                        maxLength: 500,
                        maxLines: 2,
                        decoration: InputDecoration(
                          labelText: 'Pourquoi pas de référence ?',
                          helperText: 'Par exemple : SMS de confirmation non reçu.',
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
                          'Gardez la capture ou le reçu du paiement : la trésorerie peut vous le demander.',
                          style: t.bodySmall?.copyWith(color: KombeColors.slate),
                        ),
                      ),
                    ],
                  ),
                ],
              ],
            ),
        },
      ),
      bottomNavigationBar: _vm.dues is ResourceReady<List<OpenDue>> && ((_vm.dues as ResourceReady<List<OpenDue>>).data.isNotEmpty || locked)
          ? SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
                child: FilledButton(
                  onPressed: locked ? _openReview : _review,
                  child: Text(locked ? 'Reprendre l’envoi' : 'Vérifier'),
                ),
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
      PaymentChannel.internationalTransfer => l10n.internationalTransfer,
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
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text('Reste à régler', style: t.labelLarge?.copyWith(color: KombeColors.slate)),
        const SizedBox(height: 2),
        Text(Xaf.format(total), style: t.headlineMedium?.copyWith(fontWeight: FontWeight.w800)),
        const SizedBox(height: 8),
        for (final OpenDue d in dues)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 3),
            child: Row(
              children: <Widget>[
                Expanded(child: Text('${d.fundName} · tour ${d.roundSeq}', style: t.bodyMedium)),
                if (d.late)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: Text('en retard', style: t.labelMedium?.copyWith(color: KombeColors.danger)),
                  ),
                Text(Xaf.format(d.remainingXaf), style: t.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
              ],
            ),
          ),
      ],
    );
  }
}

class _LockedNotice extends StatelessWidget {
  const _LockedNotice();

  @override
  Widget build(BuildContext context) => Text(
        'L’envoi de cette déclaration a commencé. Reprenez-le pour terminer : '
        'les lignes déjà enregistrées ne seront pas envoyées deux fois.',
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
              const Text('Vos cotisations ouvertes sont déjà déclarées ou réglées.', textAlign: TextAlign.center),
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
                        Text(Xaf.format(l.amountXaf), style: t.bodyLarge?.copyWith(fontWeight: FontWeight.w700)),
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
                    'La trésorerie du groupe confirmera après avoir retrouvé le paiement. '
                    'En attendant, la déclaration apparaît « en attente ».',
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
                        : Text(d?.sending ?? false ? 'Reprendre l’envoi' : 'Envoyer la déclaration'),
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
            SizedBox(width: 120, child: Text(k, style: t.bodyMedium?.copyWith(color: KombeColors.slate))),
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
          'Le réseau a coupé pendant l’envoi : la déclaration a peut-être été enregistrée. '
              'Reprenez l’envoi quand le réseau revient — rien ne sera déclaré deux fois.'
        ),
      DeclarationPhase.partial => (
          '${receipt.recordedCount} sur ${receipt.lines.length} enregistrées',
          'Les lignes cochées sont enregistrées. ${receipt.error ?? ''} '
              'Reprenez l’envoi pour terminer ; le brouillon est gardé sur ce téléphone.'
        ),
      _ => ('Déclaration non enregistrée', '${receipt.error ?? ''} Rien n’a été enregistré : corrigez puis renvoyez.'),
    };
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: phase == DeclarationPhase.failed ? KombeColors.danger.withValues(alpha: .08) : KombeColors.mint,
          borderRadius: BorderRadius.circular(14),
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
