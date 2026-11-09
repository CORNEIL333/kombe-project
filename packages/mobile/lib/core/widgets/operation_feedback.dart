import 'package:flutter/material.dart';

import '../api/api_failure.dart';
import '../state/operation_result.dart';

/// Motif lisible d'une opération non aboutie : le refus du serveur (raison
/// française de `OperationBlocked` ou `ApiFailure.message`), un texte clair en
/// cas de coupure réseau ; `null` quand l'opération a réussi.
String? outcomeMessage<T>(OperationResult<T> result) => switch (result) {
      OperationSuccess<T>() => null,
      OperationBlocked<T>(:final String reason) => reason,
      OperationFailure<T>(:final Object error) => failureMessage(error),
    };

/// Affiche un message court en bas de l'écran (texte du serveur, jamais un
/// code technique).
void showKombeMessage(BuildContext context, String message) {
  final ScaffoldMessengerState? messenger = ScaffoldMessenger.maybeOf(context);
  if (messenger == null) return;
  messenger
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message), duration: const Duration(seconds: 6)));
}

/// Affiche le motif de l'échec ou du refus ; renvoie vrai si l'opération a
/// réussi (rien n'est alors affiché).
bool reportOutcome<T>(BuildContext context, OperationResult<T> result) {
  final String? message = outcomeMessage(result);
  if (message == null) return true;
  showKombeMessage(context, message);
  return false;
}
