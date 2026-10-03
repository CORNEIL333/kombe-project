final class UserProfile {
  const UserProfile({
    required this.identityId,
    required this.displayName,
    required this.phoneE164,
    required this.localeCode,
    this.avatarUrl,
  });

  final String identityId;
  final String displayName;
  final String phoneE164;
  final String localeCode;
  final Uri? avatarUrl;
}
