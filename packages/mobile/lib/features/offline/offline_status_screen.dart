import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/offline/offline_policy.dart';
import '../../core/design/kombe_colors.dart';
import '../../core/widgets/section_card.dart';
import '../../domain/entities/contribution.dart';
import '../../domain/repositories/draft_repository.dart';
import '../../l10n/app_localizations.dart';

class OfflineStatusScreen extends StatefulWidget {
  const OfflineStatusScreen({super.key});

  @override
  State<OfflineStatusScreen> createState() => _OfflineStatusScreenState();
}

class _OfflineStatusScreenState extends State<OfflineStatusScreen> {
  List<ContributionDraft> _drafts = const <ContributionDraft>[];

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _load();
  }

  Future<void> _load() async {
    final List<ContributionDraft> drafts =
        await context.read<ContributionDraftRepository>().listDrafts();
    if (mounted) setState(() => _drafts = drafts);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(AppLocalizations.of(context).offlineStatus)),
        body: ListView(
          padding: const EdgeInsets.all(20),
          children: <Widget>[
            SectionCard(
              child: Column(
                children: <Widget>[
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: Icon(Icons.edit_note_outlined),
                    title: Text(AppLocalizations.of(context).ofBrouillonsLocaux),
                    subtitle: Text(
                      AppLocalizations.of(context).ofPossiblesIlsRestentSurCe,
                    ),
                  ),
                  const Divider(),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.storage_outlined),
                    title: Text(AppLocalizations.of(context).ofBrouillonsPresents),
                    trailing: Semantics(
                      label:
                          AppLocalizations.of(context).ofDraftsCount(_drafts.length),
                      child: Text('${_drafts.length}'),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            SectionCard(
              child: Column(
                children: <Widget>[
                  _CapabilityRow(
                    label: AppLocalizations.of(context).ofValidationDuneCotisation,
                    allowed: OfflinePolicy.isAllowed(
                      OfflineCapability.validateContribution,
                    ),
                  ),
                  const Divider(),
                  _CapabilityRow(
                    label: AppLocalizations.of(context).voVote2,
                    allowed: OfflinePolicy.isAllowed(OfflineCapability.vote),
                  ),
                  const Divider(),
                  _CapabilityRow(
                    label: AppLocalizations.of(context).ofChangementDeRole,
                    allowed: OfflinePolicy.isAllowed(
                      OfflineCapability.changeRole,
                    ),
                  ),
                  const Divider(),
                  _CapabilityRow(
                    label: AppLocalizations.of(context).ofPublicationDesRegles,
                    allowed: OfflinePolicy.isAllowed(
                      OfflineCapability.publishRules,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
}

class _CapabilityRow extends StatelessWidget {
  const _CapabilityRow({required this.label, required this.allowed});

  final String label;
  final bool allowed;

  @override
  Widget build(BuildContext context) => ListTile(
        contentPadding: EdgeInsets.zero,
        title: Text(label),
        trailing: Icon(
          allowed ? Icons.check_circle : Icons.block,
          color: allowed ? KombeColors.jade : KombeColors.danger,
          // Indicateur d'état : ne repose pas que sur la couleur. Un lecteur
          // d'écran annonce le verdict en toutes lettres (a11y seniors).
          semanticLabel: allowed
              ? AppLocalizations.of(context).ofAutoriseHorsConnexion
              : AppLocalizations.of(context).ofImpossibleHorsConnexionLaDecision,
        ),
      );
}
