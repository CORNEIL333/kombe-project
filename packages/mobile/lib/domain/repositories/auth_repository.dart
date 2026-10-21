import '../../core/state/operation_result.dart';
import '../../core/state/resource.dart';
import '../entities/auth.dart';

/// Contrat d'accès (ADR-0025) : preuve d'identité par CODE à usage unique
/// (6 chiffres), jamais un mot de passe ni un PIN. Inscription, connexion et
/// récupération sont le même geste côté serveur : le premier code vérifié
/// crée le compte, et chaque vérification réussie ouvre une session.
abstract interface class AuthRepository {
  Stream<Resource<AuthSession?>> watchSession();

  /// Voies réellement ouvertes (`GET /v1/auth/channels`).
  Future<Resource<AuthChannels>> loadChannels();

  /// Demande un code (`POST /v1/auth/code-requests` avec `channel`). Réponse
  /// uniforme compte connu/inconnu (anti-énumération côté serveur).
  Future<OperationResult<void>> requestCode({required String login, required LoginChannel channel});

  /// Vérifie le code (`POST /v1/auth/code-verifications`) : le serveur ouvre
  /// la session (identifiant généré SERVEUR, jamais choisi par le client).
  Future<OperationResult<AuthSession>> verifyCode({required String login, required String code});

  Future<OperationResult<void>> signOut();
}
