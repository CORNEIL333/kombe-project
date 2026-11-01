import 'package:flutter/material.dart';

import '../design/kombe_colors.dart';

/// Demi-fenêtre KÓMBE : tâche courte sans quitter l'écran courant.
///
/// - hauteur adaptée au contenu, extensible jusqu'au plein écran (glisser) ;
/// - fermeture visible (bouton 48 dp) en plus du glissement et du retour
///   système — jamais le geste comme seul moyen ;
/// - le clavier pousse le contenu (aucun champ masqué) ;
/// - `dismissible: false` pendant une requête : on ne ferme pas une action en
///   cours (le retour système est alors bloqué aussi).
Future<T?> showKombeSheet<T>(
  BuildContext context, {
  required String title,
  required WidgetBuilder builder,
  bool dismissible = true,
}) =>
    showModalBottomSheet<T>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      isDismissible: dismissible,
      enableDrag: dismissible,
      backgroundColor: KombeColors.cream,
      builder: (BuildContext sheetContext) => KombeSheetFrame(title: title, child: builder(sheetContext)),
    );

/// Cadre commun : titre + fermer, contenu défilant, marge du clavier.
class KombeSheetFrame extends StatelessWidget {
  const KombeSheetFrame({super.key, required this.title, required this.child, this.closable = true});

  final String title;
  final Widget child;
  final bool closable;

  @override
  Widget build(BuildContext context) {
    final double keyboard = MediaQuery.viewInsetsOf(context).bottom;
    return Padding(
      padding: EdgeInsets.only(bottom: keyboard),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 8, 4),
            child: Row(
              children: <Widget>[
                Expanded(
                  child: Semantics(
                    header: true,
                    child: Text(title, style: Theme.of(context).textTheme.titleLarge),
                  ),
                ),
                if (closable)
                  IconButton(
                    tooltip: MaterialLocalizations.of(context).closeButtonTooltip,
                    onPressed: () => Navigator.of(context).maybePop(),
                    icon: const Icon(Icons.close_rounded),
                  ),
              ],
            ),
          ),
          Flexible(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 20),
              child: child,
            ),
          ),
        ],
      ),
    );
  }
}
