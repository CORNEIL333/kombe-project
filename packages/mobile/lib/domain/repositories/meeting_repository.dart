import '../../core/state/resource.dart';
import '../entities/meeting.dart';

/// Séances d'un groupe, en lecture.
abstract interface class MeetingRepository {
  /// Séances du groupe, la plus récente d'abord.
  Future<Resource<List<MeetingSummary>>> listMeetings(String groupId);

  /// Détail d'une séance : présences et procès-verbal.
  Future<Resource<MeetingDetail>> getMeeting({required String groupId, required String meetingId});
}
