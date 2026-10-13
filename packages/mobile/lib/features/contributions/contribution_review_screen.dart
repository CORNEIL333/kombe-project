import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../core/formatters/xaf.dart';
import '../../core/state/operation_result.dart';
import '../../core/widgets/screen_states.dart';
import '../../core/widgets/server_action_guard.dart';
import '../../core/widgets/step_indicator.dart';
import '../../core/widgets/transparency_card.dart';
import '../../domain/entities/contribution.dart';
import '../../domain/repositories/contribution_repository.dart';
import '../../domain/repositories/draft_repository.dart';
import '../../l10n/app_localizations.dart';
import 'contribution_sent_sheet.dart';

class ContributionReviewScreen extends StatefulWidget {
  const ContributionReviewScreen({
    required this.groupId,
    required this.draftId,
    super.key,
  });

  final String groupId;
  final String draftId;

  @override
  State<ContributionReviewScreen> createState() => _ContributionReviewScreenState();
}

class _ContributionReviewScreenState extends State<ContributionReviewScreen> {
  ContributionDraft? _draft;
  bool _loading = true;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _load();
  }

  Future<void> _load() async {
    final ContributionDraft? draft =
        await context.read<ContributionDraftRepository>().getDraft(widget.draftId);
    if (mounted) {
      setState(() {
        _draft = draft;
        _loading = false;
      });
    }
  }

  Future<void> _submit() async {
    final ContributionDraft? draft = _draft;
    if (draft == null) return;
    final OperationResult<Contribution> result =
        await context.read<ContributionRepository>().submitDraft(draft);
    if (!mounted) return;
    switch (result) {
      case OperationSuccess<Contribution>():
        await context.read<ContributionDraftRepository>().deleteDraft(draft.localId);
        if (!mounted) return;
        // Retour discret, proportionné : la déclaration est envoyée, pas validée.
        unawaited(HapticFeedback.lightImpact());
        await showContributionSentSheet(context);
        if (mounted) Navigator.of(context).popUntil((Route<dynamic> route) => route.isFirst);
      case OperationBlocked<Contribution>():
        await showServerAuthorityRequired(context);
      case OperationFailure<Contribution>(:final error):
        unawaited(HapticFeedback.heavyImpact());
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.toString())));
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final ContributionDraft? draft = _draft;
    if (draft == null) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.review)),
        body: const EmptyState(
          title: 'Brouillon introuvable',
          body: 'Aucune donnée locale ne correspond à ce brouillon.',
        ),
      );
    }
    return Scaffold(
      appBar: AppBar(title: Text(l10n.review)),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: <Widget>[
            StepIndicator(
              current: 2,
              labels: <String>[l10n.information, l10n.evidence, l10n.review],
            ),
            const SizedBox(height: 28),
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(l10n.amount),
              trailing: Text(
                Xaf.format(draft.amountXaf),
                style: Theme.of(context).textTheme.titleLarge,
              ),
            ),
            const Divider(),
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(l10n.paymentMethod),
              trailing: Text(_channelLabel(l10n, draft.channel)),
            ),
            const Divider(),
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(l10n.evidence),
              trailing: Text(draft.evidencePath == null ? 'Aucun' : 'Joint'),
            ),
            if (draft.note != null) ...<Widget>[
              const Divider(),
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(l10n.noteOptional),
                subtitle: Text(draft.note!),
              ),
            ],
            const SizedBox(height: 24),
            const TransparencyCard(
              rows: <(String, String)>[
                ('Ce qui va se passer', 'Votre déclaration est envoyée au groupe. Tant que le serveur ne l’a pas acceptée, elle reste un brouillon sur cet appareil.'),
                ('Qui doit valider', 'Un membre autorisé du groupe. Jusque-là, elle apparaît « en attente ».'),
                ('Où elle restera', 'Dans l’historique du groupe, avec sa date et son statut.'),
              ],
            ),
            const SizedBox(height: 20),
            FilledButton(onPressed: _submit, child: const Text('Déclarer ma cotisation')),
          ],
        ),
      ),
    );
  }
}

String _channelLabel(AppLocalizations l10n, PaymentChannel channel) => switch (channel) {
      PaymentChannel.mobileMoney => l10n.mobileMoney,
      PaymentChannel.bankTransfer => l10n.bankTransfer,
      PaymentChannel.cash => l10n.cash,
    };
