import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kombe_mobile/core/state/operation_result.dart';
import 'package:kombe_mobile/core/state/resource.dart';
import 'package:kombe_mobile/domain/entities/notification.dart';
import 'package:kombe_mobile/domain/entities/support_ticket.dart';
import 'package:kombe_mobile/domain/repositories/support_repository.dart';
import 'package:kombe_mobile/features/support/support_screens.dart';
import 'package:kombe_mobile/l10n/app_localizations.dart';
import 'package:provider/provider.dart';

final class _FakeSupport implements SupportRepository {
  final List<String> replies = <String>[];
  final List<int> scores = <int>[];
  SupportStatus status = SupportStatus.resolved;

  @override
  Future<Resource<List<SupportTicketSummary>>> myTickets() async => ResourceReady<List<SupportTicketSummary>>(<SupportTicketSummary>[
        SupportTicketSummary(
          ticketId: 'tk_0123456789abcdef0123',
          ref: 'KMB-000001',
          subject: 'Ma cotisation n’apparaît pas',
          category: 'cotisation',
          status: SupportStatus.inProgress,
          updatedAtUtc: DateTime.utc(2026, 11, 11, 9),
          groupName: 'Njangi Akwa',
        ),
      ]);

  @override
  Future<OperationResult<String>> open(SupportTicketDraft draft) async => const OperationSuccess<String>('KMB-000002');

  @override
  Future<Resource<SupportTicket>> ticket(String ticketId) async => ResourceReady<SupportTicket>(supportTicketFrom(<String, dynamic>{
        'ticketId': ticketId,
        'ref': 'KMB-000001',
        'subject': 'Ma cotisation n’apparaît pas',
        'category': 'cotisation',
        'status': status == SupportStatus.resolved ? 'resolu' : 'ferme',
        'satisfaction': scores.isEmpty ? null : scores.last,
        'messages': <Object?>[
          <String, dynamic>{'messageId': '1', 'from': 'moi', 'body': 'J’ai versé 5000 XAF mardi.', 'createdAt': '2026-11-11T08:00:00Z'},
          <String, dynamic>{'messageId': '2', 'from': 'support', 'body': 'Le trésorier doit confirmer.', 'createdAt': '2026-11-11T09:00:00Z'},
        ],
      }));

  @override
  Future<OperationResult<void>> reply(String ticketId, String body) async {
    replies.add(body);
    return const OperationSuccess<void>(null);
  }

  @override
  Future<OperationResult<void>> rate(String ticketId, int score, {String? comment}) async {
    scores.add(score);
    return const OperationSuccess<void>(null);
  }
}

Widget _app(SupportRepository repo, Widget child, {String lang = 'fr'}) =>
    Provider<SupportRepository>.value(
      value: repo,
      child: MaterialApp(
        locale: Locale(lang),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: child,
      ),
    );

void main() {
  test('décodage d’une demande : messages publics, de qui, notation possible', () {
    final SupportTicket t = supportTicketFrom(<String, dynamic>{
      'ticketId': 'tk_0123456789abcdef0123',
      'ref': 'KMB-000007',
      'subject': 'Accès',
      'category': 'connexion',
      'status': 'resolu',
      'satisfaction': null,
      'messages': <Object?>[
        <String, dynamic>{'messageId': '1', 'from': 'moi', 'body': 'Bonjour', 'createdAt': '2026-11-11T08:00:00Z'},
        <String, dynamic>{'messageId': '2', 'from': 'support', 'body': 'Réglé', 'createdAt': '2026-11-11T09:00:00Z'},
      ],
    });
    expect(t.status, SupportStatus.resolved);
    expect(t.messages.map((SupportMessage m) => m.fromMe), <bool>[true, false]);
    expect(t.canRate, isTrue);
    expect(t.canReply, isTrue);
    expect(supportStatusFrom('ferme'), SupportStatus.closed);
    expect(supportStatusFrom('inconnu'), SupportStatus.received);
    expect(supportCategoryLabel('donnees_personnelles'), contains('données'));
  });

  test('la notification de réponse ouvre la demande, jamais une cible malformée', () {
    expect(notificationRoute(target: '/aide/demandes/tk_0123456789abcdef0123', code: 'support_reply'), '/app/support/tk_0123456789abcdef0123');
    expect(notificationRoute(target: '/aide/demandes/../../x', code: 'support_reply'), isNull);
  });

  testWidgets('mes demandes : référence, sujet, état', (WidgetTester tester) async {
    await tester.pumpWidget(_app(_FakeSupport(), const ContactSupportScreen()));
    await tester.pumpAndSettle();
    expect(find.text('Ma cotisation n’apparaît pas'), findsOneWidget);
    expect(find.textContaining('KMB-000001'), findsOneWidget);
    expect(find.text('En cours'), findsOneWidget);
    expect(find.text('Contacter le support'), findsOneWidget);
  });

  testWidgets('en anglais : mêmes écrans, textes traduits', (WidgetTester tester) async {
    await tester.pumpWidget(_app(_FakeSupport(), const ContactSupportScreen(), lang: 'en'));
    await tester.pumpAndSettle();
    expect(find.text('My requests'), findsOneWidget);
    expect(find.text('In progress'), findsOneWidget);
    expect(find.text('Contact support'), findsWidgets);
    expect(find.textContaining('Contribution'), findsOneWidget);
  });

  testWidgets('une demande résolue : fil, réponse puis note', (WidgetTester tester) async {
    final _FakeSupport repo = _FakeSupport();
    tester.view.physicalSize = const Size(800, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(_app(repo, const SupportTicketScreen(ticketId: 'tk_0123456789abcdef0123')));
    await tester.pumpAndSettle();
    expect(find.text('J’ai versé 5000 XAF mardi.'), findsOneWidget);
    expect(find.textContaining('Support KÓMBE'), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'Merci, c’est confirmé.');
    await tester.tap(find.text('Envoyer'));
    await tester.pumpAndSettle();
    expect(repo.replies, <String>['Merci, c’est confirmé.']);
    final Finder quatre = find.widgetWithText(ChoiceChip, '4');
    await tester.tap(quatre);
    await tester.pumpAndSettle();
    expect(tester.widget<ChoiceChip>(quatre).selected, isTrue);
    await tester.tap(find.text('Noter la réponse'));
    await tester.pumpAndSettle();
    expect(repo.scores, <int>[4]);
    expect(find.text('Votre note : 4 sur 5'), findsOneWidget);
  });
}
