import '../../core/state/operation_result.dart';
import '../../core/state/resource.dart';
import '../entities/profile.dart';

abstract interface class ProfileRepository {
  Future<Resource<UserProfile>> loadProfile();
  Future<OperationResult<UserProfile>> updateProfile({
    required String displayName,
    required String localeCode,
  });
  Future<OperationResult<void>> changePin({
    required String currentPin,
    required String newPin,
  });
}
