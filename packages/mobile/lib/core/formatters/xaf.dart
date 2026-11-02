import 'package:intl/intl.dart';

abstract final class Xaf {
  static final NumberFormat _format = NumberFormat.decimalPattern('fr_FR');

  /// Espace insécable ordinaire (U+00A0) entre milliers et devant la devise :
  /// l'espace fine de `fr_FR` (U+202F) manque à Fraunces (chiffres affichés
  /// collés) et le montant ne se coupe jamais en fin de ligne.
  static String format(int minorUnits) => '${_format.format(minorUnits).replaceAll('\u202F', '\u00A0')}\u00A0FCFA';

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
