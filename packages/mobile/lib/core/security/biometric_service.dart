import 'package:local_auth/local_auth.dart';

final class BiometricService {
  BiometricService(this._auth);

  final LocalAuthentication _auth;

  Future<bool> isSupported() async {
    final bool supported = await _auth.isDeviceSupported();
    final bool canCheck = await _auth.canCheckBiometrics;
    return supported && canCheck;
  }

  Future<bool> authenticate(String localizedReason) async {
    if (!await isSupported()) return false;
    return _auth.authenticate(
      localizedReason: localizedReason,
      biometricOnly: true,
      persistAcrossBackgrounding: true,
    );
  }
}
