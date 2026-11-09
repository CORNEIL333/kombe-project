import 'dart:typed_data';

import '../../core/state/operation_result.dart';
import '../../core/state/resource.dart';
import '../entities/profile.dart';

abstract interface class ProfileRepository {
  Future<Resource<UserProfile>> loadProfile();
  Future<OperationResult<UserProfile>> updateProfile({
    required String displayName,
    required String localeCode,
  });
  /// Ma photo de profil : lecture, remplacement (JPEG déjà préparés), retrait.
  Future<Uint8List?> loadPhoto(int version, int size);
  Future<OperationResult<int>> setPhoto(Uint8List jpeg512, Uint8List jpeg256);
  Future<OperationResult<void>> removePhoto();
}
