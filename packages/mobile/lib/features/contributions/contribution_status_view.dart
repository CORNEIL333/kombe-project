import 'package:flutter/material.dart';

import '../../core/formatters/labels.dart';
import '../../core/widgets/kombe_components.dart';
import '../../domain/entities/contribution.dart';

/// Tonalité d'un statut de cotisation (pastilles, pictos, listes).
KombeTone contributionTone(ContributionStatus s) => switch (s) {
      ContributionStatus.confirmed || ContributionStatus.validated => KombeTone.success,
      ContributionStatus.submitted => KombeTone.warning,
      ContributionStatus.rejected || ContributionStatus.disputed => KombeTone.danger,
      ContributionStatus.compensated => KombeTone.info,
      ContributionStatus.draft => KombeTone.neutral,
    };

IconData contributionIcon(ContributionStatus s) => switch (s) {
      ContributionStatus.confirmed || ContributionStatus.validated => Icons.check_circle_outline_rounded,
      ContributionStatus.submitted => Icons.hourglass_top_rounded,
      ContributionStatus.rejected => Icons.block_rounded,
      ContributionStatus.disputed => Icons.report_gmailerrorred_rounded,
      ContributionStatus.compensated => Icons.published_with_changes_rounded,
      ContributionStatus.draft => Icons.edit_note_rounded,
    };

/// Pastille du statut : libellé + picto, jamais la couleur seule.
class ContributionStatusPill extends StatelessWidget {
  const ContributionStatusPill(this.status, {super.key});
  final ContributionStatus status;

  @override
  Widget build(BuildContext context) =>
      StatusPill(KombeLabels.contributionStatus(status), tone: contributionTone(status), icon: contributionIcon(status));
}
