import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/formatters/labels.dart';
import '../../core/design/kombe_colors.dart';
import '../../core/widgets/kombe_components.dart';
import '../../core/state/resource.dart';
import '../../core/widgets/screen_states.dart';
import '../../domain/entities/contribution.dart';
import '../../domain/repositories/contribution_repository.dart';
import 'contribution_status_view.dart';

class ContributionDetailScreen extends StatefulWidget {
  const ContributionDetailScreen({required this.contributionId, super.key});
  final String contributionId;

  @override
  State<ContributionDetailScreen> createState() => _ContributionDetailScreenState();
}

class _ContributionDetailScreenState extends State<ContributionDetailScreen> {
  Resource<Contribution> _state = const ResourceLoading<Contribution>();

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _load();
  }

  Future<void> _load() async {
    final Resource<Contribution> state =
        await context.read<ContributionRepository>().getContribution(widget.contributionId);
    if (mounted) setState(() => _state = state);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Détail de cotisation')),
        body: ResourceView<Contribution>(
          resource: _state,
          onRetry: _load,
          builder: (BuildContext context, Contribution c) {
            final DateTime? d = c.declaredAtUtc;
            final String locale = Localizations.localeOf(context).toLanguageTag();
            return ListView(
              padding: const EdgeInsets.only(bottom: 32),
              children: <Widget>[
                // Reçu : montant, statut, parcours de confirmation.
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
                  child: KombeCard(
                    padding: const EdgeInsets.fromLTRB(20, 24, 20, 20),
                    child: Column(
                      children: <Widget>[
                        KombeIconBadge(contributionIcon(c.status), tone: contributionTone(c.status), size: 52),
                        const SizedBox(height: 14),
                        FittedBox(fit: BoxFit.scaleDown, child: KombeAmount(c.amountXaf, size: 36)),
                        const SizedBox(height: 10),
                        ContributionStatusPill(c.status),
                        const SizedBox(height: 22),
                        _Journey(status: c.status),
                      ],
                    ),
                  ),
                ),
                const KombeSection('Détails'),
                KombeGroupedList(
                  children: <Widget>[
                    KombeFact(icon: Icons.smartphone_rounded, label: 'Canal déclaré', value: KombeLabels.channel(c.channel)),
                    KombeFact(
                      icon: Icons.event_outlined,
                      label: 'Déclarée le',
                      // Horodatage du serveur ; « — » s'il n'est pas rendu (jamais inventé).
                      value: d == null ? '—' : DateFormat('d MMMM y, HH:mm', locale).format(d.toLocal()),
                    ),
                    if (c.evidenceName != null) KombeFact(icon: Icons.attach_file_rounded, label: 'Justificatif', value: c.evidenceName!),
                    if (c.note != null && c.note!.trim().isNotEmpty) KombeFact(icon: Icons.notes_rounded, label: 'Note', value: c.note!),
                  ],
                ),
              ],
            );
          },
        ),
      );
}

/// Parcours : déclarée → confirmée par la trésorerie → validée.
/// Un refus ou une contestation interrompt le parcours après la déclaration.
class _Journey extends StatelessWidget {
  const _Journey({required this.status});
  final ContributionStatus status;

  @override
  Widget build(BuildContext context) {
    final int reached = switch (status) {
      ContributionStatus.draft => 0,
      ContributionStatus.submitted || ContributionStatus.rejected || ContributionStatus.disputed => 1,
      ContributionStatus.confirmed || ContributionStatus.compensated => 2,
      ContributionStatus.validated => 3,
    };
    final bool broken = status == ContributionStatus.rejected || status == ContributionStatus.disputed;
    const List<String> steps = <String>['Déclarée', 'Confirmée', 'Validée'];
    return Semantics(
      label: 'Étape ${reached.clamp(0, 3)} sur 3${broken ? ', interrompue' : ''}',
      excludeSemantics: true,
      child: Row(
        children: <Widget>[
          for (int i = 0; i < 3; i++) ...<Widget>[
            Expanded(
              child: Column(
                children: <Widget>[
                  Container(
                    width: 26,
                    height: 26,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: i < reached ? KombeColors.jade : (broken && i == reached ? KombeTone.danger.bg : KombeColors.sand),
                    ),
                    child: Icon(
                      i < reached ? Icons.check_rounded : (broken && i == reached ? Icons.close_rounded : Icons.circle),
                      size: i < reached || (broken && i == reached) ? 16 : 7,
                      color: i < reached ? Colors.white : (broken && i == reached ? KombeColors.danger : KombeColors.lineStrong),
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(steps[i], style: TextStyle(fontSize: 12.5, fontWeight: i < reached ? FontWeight.w800 : FontWeight.w600, color: i < reached ? KombeColors.forest : KombeColors.slate)),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}
