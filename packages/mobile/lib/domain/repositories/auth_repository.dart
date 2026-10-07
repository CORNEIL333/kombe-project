import '../../core/state/operation_result.dart';
import '../../core/state/resource.dart';
import '../entities/auth.dart';

/// Contrat d'accès (ADR-0024) : preuve d'identité par CODE email à usage
/// unique, jamais un mot de passe ni un PIN (D05 écarte le SMS/OTP pour ce
/// premier déploiement — email est le canal unique). `identityId` est
/// l'adresse email du compte. Un code n'est jamais généré ni connu du client :
/// il est toujours remis hors bande (email) par le serveur.
abstract interface class AuthRepository {
  Stream<Resource<AuthSession?>> watchSession();

  /// 1/2 inscription — compte créé en attente, code envoyé (202 uniforme,
  /// anti-énumération côté serveur).
  Future<OperationResult<void>> requestRegistration(String identityId);

  /// 2/2 inscription — vérifie le code, active le compte. AUCUNE session
  /// n'est ouverte ici (voir [requestLogin]/[completeLogin]).
  Future<OperationResult<AccountStatus>> verifyRegistration({
    required String identityId,
    required String code,
  });

  /// 1/2 connexion — lien magique par email (même gabarit anti-énumération).
  Future<OperationResult<void>> requestLogin(String identityId);

  /// 2/2 connexion — vérifie le code, obtient une session RÉELLE
  /// (`sessionId` généré SERVEUR, jamais choisi par le client).
  Future<OperationResult<AuthSession>> completeLogin({
    required String identityId,
    required String code,
  });

  /// 1/2 récupération — gabarit identique compte connu/inconnu.
  Future<OperationResult<void>> requestRecovery(String identityId);

  /// 2/2 récupération — révoque les sessions antérieures côté serveur.
  /// Ne délivre PAS de session : une connexion normale reste nécessaire après.
  Future<OperationResult<void>> completeRecovery({
    required String identityId,
    required String code,
  });

  Future<OperationResult<void>> signOut();
}
