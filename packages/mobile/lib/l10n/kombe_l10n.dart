import 'package:flutter/widgets.dart';

import 'app_localizations.dart';

/// Textes de la langue choisie, pour les libellés calculés hors d'un widget
/// (fonctions du bureau, rythmes, statuts…). La racine de l'application le
/// met à jour à chaque changement de langue ; sans elle (tests isolés),
/// le français s'applique.
abstract final class KombeL10n {
  static AppLocalizations? _current;

  static AppLocalizations get current => _current ?? lookupAppLocalizations(const Locale('fr'));

  static void update(BuildContext context) => _current = AppLocalizations.of(context);

  @visibleForTesting
  static void reset() => _current = null;
}
