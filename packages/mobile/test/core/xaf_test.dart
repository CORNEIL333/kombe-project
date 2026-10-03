import 'package:flutter_test/flutter_test.dart';
import 'package:kombe_mobile/core/formatters/xaf.dart';

void main() {
  test('XAF parser accepts integer amounts only', () {
    expect(Xaf.parseInteger('25000'), 25000);
    expect(Xaf.parseInteger('25 000'), 25000);
    expect(Xaf.parseInteger('25.50'), isNull);
    expect(Xaf.parseInteger('-1'), isNull);
    expect(Xaf.parseInteger(''), isNull);
  });
}
