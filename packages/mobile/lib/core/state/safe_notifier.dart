import 'package:flutter/foundation.dart';

/// Un écran peut être quitté pendant une lecture ou un envoi : la réponse
/// qui arrive ensuite est ignorée au lieu de faire planter l'app.
mixin SafeNotifier on ChangeNotifier {
  bool _disposed = false;

  bool get disposed => _disposed;

  @override
  void notifyListeners() {
    if (!_disposed) super.notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}
