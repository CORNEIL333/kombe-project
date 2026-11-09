import 'package:flutter_test/flutter_test.dart';
import 'package:kombe_mobile/data/remote/tontine_repositories.dart';
import 'package:kombe_mobile/domain/entities/meeting.dart';
import 'package:kombe_mobile/domain/entities/notification.dart';
import 'package:kombe_mobile/domain/entities/poll.dart';
import 'package:kombe_mobile/features/notifications/notifications_screen.dart';

KombeNotification _n(String id, String code, String topic, String group) => KombeNotification(
      id: id,
      kind: NotificationKind.system,
      title: 't',
      body: '',
      createdAtUtc: DateTime.utc(2026, 11, 6),
      read: false,
      code: code,
      topic: topic,
      groupId: group,
    );

void main() {
  test('vote libre : décodage, réponse et anonymat', () {
    final Poll p = pollFrom('g1', <String, dynamic>{
      'pollId': 'pol_1',
      'question': 'Quel jour ?',
      'options': <Object?>['Samedi', 'Dimanche'],
      'allowFreeAnswer': true,
      'multiple': false,
      'anonymous': true,
      'state': 'open',
      'createdByName': 'Daniel',
      'createdAt': '2026-11-06T10:00:00.000Z',
      'electorate': 4,
      'ballotCount': 2,
      'counts': <Object?>[1, 1],
      'freeAnswers': <Object?>[<String, dynamic>{'text': 'Lundi', 'name': null}],
      'voters': null,
      'myBallot': <String, dynamic>{'choices': <Object?>[1], 'freeAnswer': null},
      'canManage': false,
    });
    expect(p.state, PollState.open);
    expect(p.counts, <int>[1, 1]);
    expect(p.voters, isNull);
    expect(p.answered, isTrue);
    expect(p.myChoices, <int>[1]);
    expect(p.freeAnswers.single.text, 'Lundi');
  });

  test('séance en ligne : modalité et lien', () {
    final MeetingSummary m = meetingFrom('g1', <String, dynamic>{
      'meetingId': 'm1',
      'seq': 1,
      'date': '2026-11-06',
      'state': 'planned',
      'minutesApproved': false,
      'format': 'hybrid',
      'onlineUrl': 'https://meet.example.org/x',
    });
    expect(m.format, MeetingFormat.hybrid);
    expect(m.onlineUrl, 'https://meet.example.org/x');
    expect(meetingFrom('g1', <String, dynamic>{'meetingId': 'm2', 'seq': 2, 'date': '2026-11-13', 'state': 'planned'}).format, MeetingFormat.inPerson);
  });

  test('Activité : notifications de même nature regroupées, ordre conservé', () {
    final List<List<KombeNotification>> packs = groupNotifications(<KombeNotification>[
      _n('1', 'due_reminder', 'due', 'g1'),
      _n('2', 'poll_opened', 'poll', 'g1'),
      _n('3', 'due_reminder', 'due', 'g1'),
      _n('4', 'due_reminder', 'due', 'g2'),
    ]);
    expect(packs.map((List<KombeNotification> p) => p.map((KombeNotification n) => n.id).join(',')).toList(), <String>['1,3', '2', '4']);
  });
}
