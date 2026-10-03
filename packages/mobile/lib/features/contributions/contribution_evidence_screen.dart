import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/widgets/step_indicator.dart';
import '../../domain/repositories/draft_repository.dart';
import '../../l10n/app_localizations.dart';
import 'contribution_draft_view_model.dart';

class ContributionEvidenceScreen extends StatefulWidget {
  const ContributionEvidenceScreen({
    required this.groupId,
    required this.draftId,
    super.key,
  });

  final String groupId;
  final String draftId;

  @override
  State<ContributionEvidenceScreen> createState() => _ContributionEvidenceScreenState();
}

class _ContributionEvidenceScreenState extends State<ContributionEvidenceScreen> {
  ContributionDraftViewModel? _vm;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _vm ??= ContributionDraftViewModel(
      context.read<ContributionDraftRepository>(),
      widget.groupId,
      localId: widget.draftId,
    )..load();
  }

  @override
  void dispose() {
    _vm?.dispose();
    super.dispose();
  }

  Future<void> _pick() async {
    // file_picker >=13 : FilePicker.pickFile est statique et renvoie
    // directement un PlatformFile? (null = annulation). L'ancienne API
    // (FilePicker.platform / FilePickerResult.files) n'existe plus.
    final PlatformFile? file = await FilePicker.pickFile(
      type: FileType.custom,
      allowedExtensions: <String>['jpg', 'jpeg', 'png', 'pdf'],
    );
    final String? path = file?.path;
    if (path == null || !mounted) return;
    await _vm!.attachEvidence(path);
  }

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.declareContribution)),
      body: SafeArea(
        child: ListenableBuilder(
          listenable: _vm!,
          builder: (BuildContext context, Widget? child) {
            final String? evidencePath = _vm!.draft?.evidencePath;
            return ListView(
              padding: const EdgeInsets.all(20),
              children: <Widget>[
                StepIndicator(
                  current: 1,
                  labels: <String>[l10n.information, l10n.evidence, l10n.review],
                ),
                const SizedBox(height: 28),
                Text(l10n.evidence, style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 8),
                const Text(
                  'Le fichier reste local jusqu’à une soumission serveur explicite. Il n’est pas une preuve de validation.',
                ),
                const SizedBox(height: 20),
                OutlinedButton.icon(
                  onPressed: _pick,
                  icon: const Icon(Icons.attach_file),
                  label: Text(evidencePath == null ? l10n.addEvidence : 'Remplacer le justificatif'),
                ),
                if (evidencePath != null) ...<Widget>[
                  const SizedBox(height: 12),
                  Text(
                    evidencePath.split(RegExp(r'[/\\]')).last,
                    textAlign: TextAlign.center,
                  ),
                ],
                const SizedBox(height: 28),
                FilledButton(
                  onPressed: () => context.push(
                    '/app/groups/${widget.groupId}/contributions/${widget.draftId}/review',
                  ),
                  child: Text(l10n.next),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}
