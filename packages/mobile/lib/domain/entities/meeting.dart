/// Séance d'un groupe (`GET /v1/tontines/:id/meetings`). Lecture seule sur
/// mobile : ouvrir, pointer et clore une séance se fait à l'Espace bureau.
enum MeetingState { planned, open, closed, cancelled }

MeetingState meetingStateFrom(Object? v) => switch ('$v') {
      'open' => MeetingState.open,
      'closed' => MeetingState.closed,
      'cancelled' => MeetingState.cancelled,
      _ => MeetingState.planned,
    };

String meetingStateLabel(MeetingState s) => switch (s) {
      MeetingState.planned => 'Prévue',
      MeetingState.open => 'En cours',
      MeetingState.closed => 'Close',
      MeetingState.cancelled => 'Annulée',
    };

/// Modalité d'une séance (0041).
enum MeetingFormat { inPerson, online, hybrid }

MeetingFormat meetingFormatFrom(Object? v) => switch ('$v') {
      'online' => MeetingFormat.online,
      'hybrid' => MeetingFormat.hybrid,
      _ => MeetingFormat.inPerson,
    };

String meetingFormatLabel(MeetingFormat f) => switch (f) {
      MeetingFormat.inPerson => 'Sur place',
      MeetingFormat.online => 'En ligne',
      MeetingFormat.hybrid => 'Sur place et en ligne',
    };

enum AttendanceStatus { present, late, excused, absent, represented, unknown }

AttendanceStatus attendanceStatusFrom(Object? v) => switch ('$v') {
      'present' => AttendanceStatus.present,
      'late' => AttendanceStatus.late,
      'excused' => AttendanceStatus.excused,
      'absent' => AttendanceStatus.absent,
      'represented' => AttendanceStatus.represented,
      _ => AttendanceStatus.unknown,
    };

String attendanceStatusLabel(AttendanceStatus s) => switch (s) {
      AttendanceStatus.present => 'Présent',
      AttendanceStatus.late => 'En retard',
      AttendanceStatus.excused => 'Excusé',
      AttendanceStatus.absent => 'Absent',
      AttendanceStatus.represented => 'Représenté',
      AttendanceStatus.unknown => 'Non pointé',
    };

class MeetingSummary {
  const MeetingSummary({
    required this.meetingId,
    required this.groupId,
    required this.seq,
    required this.date,
    required this.state,
    required this.minutesApproved,
    this.location,
    this.hostName,
    this.roundSeq,
    this.format = MeetingFormat.inPerson,
    this.onlineUrl,
  });

  final String meetingId;
  final String groupId;
  final int seq;
  final DateTime date;
  final MeetingState state;
  final bool minutesApproved;
  final String? location;
  final String? hostName;
  final int? roundSeq;

  /// Présentiel, en ligne ou les deux (0041) ; lien https si en ligne.
  final MeetingFormat format;
  final String? onlineUrl;
}

final class MeetingAttendance {
  const MeetingAttendance({required this.membershipId, required this.displayName, required this.status});

  final String membershipId;
  final String displayName;
  final AttendanceStatus status;
}

final class MeetingMinutes {
  const MeetingMinutes({required this.text, this.approvedAtUtc});

  final String text;
  final DateTime? approvedAtUtc;
}

final class MeetingDetail extends MeetingSummary {
  const MeetingDetail({
    required super.meetingId,
    required super.groupId,
    required super.seq,
    required super.date,
    required super.state,
    required super.minutesApproved,
    required this.attendance,
    super.location,
    super.hostName,
    super.roundSeq,
    super.format,
    super.onlineUrl,
    this.notes,
    this.minutes,
  });

  final List<MeetingAttendance> attendance;
  final String? notes;
  final MeetingMinutes? minutes;
}
