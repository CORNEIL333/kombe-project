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

/// Voie par laquelle le code de connexion est envoyé (`channel` de
/// `POST /v1/auth/code-requests`). Le nom d'API est [apiName].
enum LoginChannel { email, sms, whatsapp }

extension LoginChannelX on LoginChannel {
  String get apiName => switch (this) {
        LoginChannel.email => 'email',
        LoginChannel.sms => 'sms',
        LoginChannel.whatsapp => 'whatsapp',
      };

  bool get isPhone => this != LoginChannel.email;

  /// Libellé du choix de voie.
  String get label => switch (this) {
        LoginChannel.email => 'E-mail',
        LoginChannel.sms => 'SMS',
        LoginChannel.whatsapp => 'WhatsApp',
      };

  /// Libellé du champ de saisie.
  String get fieldLabel => switch (this) {
        LoginChannel.email => 'Adresse e-mail',
        LoginChannel.sms || LoginChannel.whatsapp => 'Numéro de téléphone',
      };

  /// « … reçu par e-mail / SMS / WhatsApp ».
  String get viaLabel => switch (this) {
        LoginChannel.email => 'par e-mail',
        LoginChannel.sms => 'par SMS',
        LoginChannel.whatsapp => 'sur WhatsApp',
      };
}

LoginChannel? loginChannelFrom(String? value) => switch (value) {
      'email' => LoginChannel.email,
      'sms' => LoginChannel.sms,
      'whatsapp' => LoginChannel.whatsapp,
      _ => null,
    };

/// Voies de connexion réellement ouvertes sur le serveur
/// (`GET /v1/auth/channels`). En production : e-mail seulement, tant que
/// l'envoi par SMS ou WhatsApp n'est pas ouvert.
final class AuthChannels {
  const AuthChannels({required this.email, required this.sms, required this.whatsapp});

  final bool email;
  final bool sms;
  final bool whatsapp;

  /// Voies ouvertes, dans l'ordre d'affichage.
  List<LoginChannel> get open => <LoginChannel>[
        if (email) LoginChannel.email,
        if (sms) LoginChannel.sms,
        if (whatsapp) LoginChannel.whatsapp,
      ];
}
