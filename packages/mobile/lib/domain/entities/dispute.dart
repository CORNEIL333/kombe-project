enum DisputeStatus { open, underReview, awaitingInformation, resolved, rejected }

final class DisputeSummary {
  const DisputeSummary({
    required this.id,
    required this.groupId,
    required this.subject,
    required this.status,
    required this.openedAtUtc,
  });

  final String id;
  final String groupId;
  final String subject;
  final DisputeStatus status;
  final DateTime openedAtUtc;
}

final class DisputeDetails {
  const DisputeDetails({
    required this.summary,
    required this.description,
    required this.timeline,
  });

  final DisputeSummary summary;
  final String description;
  final List<DisputeTimelineEntry> timeline;
}

final class DisputeTimelineEntry {
  const DisputeTimelineEntry({
    required this.label,
    required this.atUtc,
  });

  final String label;
  final DateTime atUtc;
}
