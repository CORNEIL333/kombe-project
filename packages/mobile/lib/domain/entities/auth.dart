enum AccountStatus { active, suspended, pendingVerification }

final class AuthSession {
  const AuthSession({
    required this.identityId,
    required this.accountStatus,
    required this.expiresAtUtc,
  });

  final String identityId;
  final AccountStatus accountStatus;
  final DateTime expiresAtUtc;
}
