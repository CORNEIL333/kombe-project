import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kombe_mobile/core/design/kombe_theme.dart';
import 'package:kombe_mobile/core/state/operation_result.dart';
import 'package:kombe_mobile/core/state/resource.dart';
import 'package:kombe_mobile/data/remote/tontine_repositories.dart';
import 'package:kombe_mobile/domain/entities/meeting.dart';
import 'package:kombe_mobile/domain/repositories/meeting_repository.dart';
import 'package:kombe_mobile/features/meetings/meeting_screens.dart';
import 'package:kombe_mobile/l10n/app_localizations.dart';
import 'package:provider/provider.dart';
import 'package:provider/single_child_widget.dart';
import 'package:kombe_mobile/data/repositories/unavailable_repositories.dart';
import 'package:kombe_mobile/domain/repositories/group_repository.dart';

final class _Repo implements MeetingRepository {
  _Repo(this.list, this.detail);
  final Resource<List<MeetingSummary>> list;
  final Resource<MeetingDetail> detail;

  @override
  Future<Resource<List<MeetingSummary>>> listMeetings(String groupId) async => list;

  @override
  Future<Resource<MeetingDetail>> getMeeting({required String groupId, required String meetingId}) async => detail;

  @override
  Future<OperationResult<MeetingDetail>> updateMeeting({
    required String groupId,
    required String meetingId,
    required MeetingFormat format,
    String? onlineUrl,
    String? location,
  }) async =>
      const OperationBlocked<MeetingDetail>('Indisponible');
}

MeetingSummary _m(int seq, MeetingState state) =>
    MeetingSummary(meetingId: 'mt$seq', groupId: 'g', seq: seq, date: DateTime.utc(2026, 11, seq), state: state, minutesApproved: false, location: 'Chez Amina');

Widget _app(MeetingRepository r, Widget child) => MultiProvider(
      providers: <SingleChildWidget>[
        Provider<MeetingRepository>.value(value: r),
        Provider<GroupRepository>.value(value: const UnavailableGroupRepository()),
      ],
      child: MaterialApp(
        theme: KombeTheme.light(),
        locale: const Locale('fr'),
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: const <LocalizationsDelegate<dynamic>>[
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        home: child,
      ),
    );

void main() {
  test('la réponse de l’API devient une séance, statuts inconnus compris', () {
    final MeetingDetail d = meetingDetailFrom('g', <String, dynamic>{
      'meetingId': 'mt4',
      'seq': 4,
      'date': '2026-11-15',
      'state': 'closed',
      'location': 'Bastos',
      'hostName': null,
      'roundSeq': 4,
      'minutesApproved': true,
      'notes': null,
      'attendance': <Map<String, dynamic>>[
        <String, dynamic>{'membershipId': 'm1', 'displayName': 'Amina', 'status': 'present'},
        <String, dynamic>{'membershipId': 'm2', 'displayName': 'Paul', 'status': null},
      ],
      'minutes': <String, dynamic>{'text': 'PV', 'hash': 'h', 'approvedAt': '2026-11-16T10:00:00.000Z'},
    });
    expect(d.state, MeetingState.closed);
    expect(d.attendance.first.status, AttendanceStatus.present);
    expect(d.attendance.last.status, AttendanceStatus.unknown);
    expect(d.minutes?.text, 'PV');
    expect(meetingStateFrom('inattendu'), MeetingState.planned);
  });

  testWidgets('la liste sépare les séances à venir des séances passées', (WidgetTester tester) async {
    final _Repo r = _Repo(
      ResourceReady<List<MeetingSummary>>(<MeetingSummary>[_m(4, MeetingState.planned), _m(3, MeetingState.closed)]),
      const ResourceLoading<MeetingDetail>(),
    );
    await tester.pumpWidget(_app(r, const MeetingsScreen(groupId: 'g')));
    await tester.pumpAndSettle();
    expect(find.text('À venir'), findsOneWidget);
    expect(find.text('Passées'), findsOneWidget);
    expect(find.text('Séance 4'), findsOneWidget);
    expect(find.text('Prévue'), findsOneWidget);
    expect(find.text('Close'), findsOneWidget);
  });

  testWidgets('sans séance, l’écran le dit', (WidgetTester tester) async {
    final _Repo r = _Repo(const ResourceReady<List<MeetingSummary>>(<MeetingSummary>[]), const ResourceLoading<MeetingDetail>());
    await tester.pumpWidget(_app(r, const MeetingsScreen(groupId: 'g')));
    await tester.pumpAndSettle();
    expect(find.text('Aucune séance'), findsOneWidget);
  });

  testWidgets('le détail montre les présences et le procès-verbal', (WidgetTester tester) async {
    final _Repo r = _Repo(
      const ResourceLoading<List<MeetingSummary>>(),
      ResourceReady<MeetingDetail>(MeetingDetail(
        meetingId: 'mt3',
        groupId: 'g',
        seq: 3,
        date: DateTime.utc(2026, 10, 12),
        state: MeetingState.closed,
        minutesApproved: false,
        location: 'Chez Paul',
        attendance: const <MeetingAttendance>[MeetingAttendance(membershipId: 'm1', displayName: 'Amina', status: AttendanceStatus.late)],
        minutes: const MeetingMinutes(text: 'Séance tenue.'),
      )),
    );
    await tester.pumpWidget(_app(r, const MeetingDetailScreen(groupId: 'g', meetingId: 'mt3')));
    await tester.pumpAndSettle();
    expect(find.text('Chez Paul'), findsOneWidget);
    expect(find.text('En retard'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('Séance tenue.'), 200);
    expect(find.text('En attente d’approbation'), findsOneWidget);
  });
}
