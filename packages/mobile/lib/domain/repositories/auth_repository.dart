import '../../core/state/operation_result.dart';
import '../../core/state/resource.dart';
import '../entities/auth.dart';

abstract interface class AuthRepository {
  Stream<Resource<AuthSession?>> watchSession();

  Future<OperationResult<AuthSession>> signIn({
    required String phoneE164,
    required String pin,
  });

  Future<OperationResult<void>> registerPhone(String phoneE164);
  Future<OperationResult<void>> verifyPhone({required String challengeCode});
  Future<OperationResult<void>> setPin(String pin);
  Future<OperationResult<void>> requestPinRecovery(String phoneE164);
  Future<OperationResult<void>> completePinRecovery({
    required String challengeCode,
    required String newPin,
  });
  Future<OperationResult<void>> signOut();
}
