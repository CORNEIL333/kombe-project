import '../../core/state/operation_result.dart';
import '../../core/state/resource.dart';
import '../entities/meeting.dart';

/// Séances d'un groupe, en lecture.
abstract interface class MeetingRepository {
  /// Séances du groupe, la plus récente d'abord.
  Future<Resource<List<MeetingSummary>>> listMeetings(String groupId);

  /// Détail d'une séance : présences et procès-verbal.
  Future<Resource<MeetingDetail>> getMeeting({required String groupId, required String meetingId});

  /// Bureau : modalité d'une séance prévue ou ouverte (0041) — sur place, en
  /// ligne (lien https) ou les deux, et le lieu. Les membres sont prévenus.
  Future<OperationResult<MeetingDetail>> updateMeeting({
    required String groupId,
    required String meetingId,
    required MeetingFormat format,
    String? onlineUrl,
    String? location,
  });
}
