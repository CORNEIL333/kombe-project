final class UserProfile {
  const UserProfile({
    required this.identityId,
    required this.displayName,
    required this.phoneE164,
    required this.localeCode,
    this.photoVersion,
  });

  final String identityId;
  final String displayName;
  final String phoneE164;
  final String localeCode;
  /// Version de ma photo de profil (clé de cache) ; null = pas de photo.
  final int? photoVersion;
}
