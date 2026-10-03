import 'package:intl/intl.dart';

abstract final class Xaf {
  static final NumberFormat _format = NumberFormat.decimalPattern('fr_FR');

  static String format(int minorUnits) => '${_format.format(minorUnits)} FCFA';

  static int? parseInteger(String raw) {
    final String normalized = raw
        .replaceAll('\u00A0', '')
        .replaceAll(' ', '')
        .replaceAll(',', '');
    if (normalized.isEmpty || !RegExp(r'^\d+$').hasMatch(normalized)) {
      return null;
    }
    return int.tryParse(normalized);
  }
}
