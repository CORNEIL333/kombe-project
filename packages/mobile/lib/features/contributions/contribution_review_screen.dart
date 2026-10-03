import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/formatters/xaf.dart';
import '../../core/state/operation_result.dart';
import '../../core/widgets/screen_states.dart';
import '../../core/widgets/server_action_guard.dart';
import '../../core/widgets/step_indicator.dart';
import '../../domain/entities/contribution.dart';
import '../../domain/repositories/contribution_repository.dart';
import '../../domain/repositories/draft_repository.dart';
import '../../l10n/app_localizations.dart';

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
        if (mounted) Navigator.of(context).popUntil((Route<dynamic> route) => route.isFirst);
      case OperationBlocked<Contribution>():
        await showServerAuthorityRequired(context);
      case OperationFailure<Contribution>(:final error):
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
              trailing: Text(draft.channel.name),
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
            const Text(
              'La soumission est une commande serveur. Tant que le serveur n’a pas accepté la commande, ce brouillon ne devient jamais une cotisation déclarée.',
            ),
            const SizedBox(height: 20),
            FilledButton(onPressed: _submit, child: Text(l10n.submit)),
          ],
        ),
      ),
    );
  }
}
