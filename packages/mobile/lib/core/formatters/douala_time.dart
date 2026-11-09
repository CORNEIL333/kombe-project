/// Dates affichées à l'heure de Douala (Africa/Douala = UTC+1 toute l'année,
/// pas d'heure d'été au Cameroun), en français, sans dépendre de la langue de
/// l'appareil ni des données de localisation d'intl.
abstract final class DoualaTime {
  static const List<String> _months = <String>[
    'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
  ];

  static String _two(int n) => n.toString().padLeft(2, '0');

  /// Instant (ISO 8601 ou DateTime) → heure locale de Douala.
  static DateTime? toDouala(Object? value) {
    final DateTime? utc = value is DateTime ? value.toUtc() : DateTime.tryParse('${value ?? ''}')?.toUtc();
    return utc?.add(const Duration(hours: 1));
  }

  /// « 05 novembre 18:00 » (dd MMMM HH:mm, heure de Douala).
  static String dateTime(Object? instant) {
    final DateTime? d = toDouala(instant);
    if (d == null) return '';
    return '${_two(d.day)} ${_months[d.month - 1]} ${_two(d.hour)}:${_two(d.minute)}';
  }

  /// « 05 novembre » pour un instant (heure de Douala) ou une date métier
  /// `YYYY-MM-DD` (déjà une date de Douala).
  static String date(Object? value) {
    final String s = '${value ?? ''}';
    final RegExpMatch? m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(s);
    if (m != null) {
      final int month = int.parse(m.group(2)!);
      if (month < 1 || month > 12) return s;
      return '${m.group(3)} ${_months[month - 1]}';
    }
    final DateTime? d = toDouala(value);
    if (d == null) return '';
    return '${_two(d.day)} ${_months[d.month - 1]}';
  }
}
