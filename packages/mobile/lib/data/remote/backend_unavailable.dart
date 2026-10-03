final class BackendUnavailableException implements Exception {
  const BackendUnavailableException([
    this.message = 'KÓMBE backend is not configured for this build.',
  ]);

  final String message;

  @override
  String toString() => message;
}
