import 'package:flutter_test/flutter_test.dart';
import 'package:kombe_mobile/trial/trial_mode.dart';

void main() {
  final DateTime start = DateTime.utc(2026, 10, 9, 10);

  test('premier jour : 30 jours restants', () {
    final TrialStatus s = TrialStatus(start, start);
    expect(s.expired, isFalse);
    expect(s.daysLeft, kTrialDays);
  });

  test('jour 23 : 7 jours restants (arrondi au jour supérieur)', () {
    final TrialStatus s = TrialStatus(start, start.add(const Duration(days: 23, hours: 2)));
    expect(s.daysLeft, 7);
    expect(s.expired, isFalse);
  });

  test('après 30 jours : essai terminé, 0 jour restant', () {
    final TrialStatus s = TrialStatus(start, start.add(const Duration(days: 30)));
    expect(s.expired, isTrue);
    expect(s.daysLeft, 0);
  });
}
