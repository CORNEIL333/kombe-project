import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/state/resource.dart';
import '../domain/entities/group.dart';
import '../domain/repositories/group_repository.dart';
import 'session_controller.dart';

/// Groupe actif : celui que la personne a CHOISI (mémorisé sur l'appareil),
/// jamais « le premier renvoyé par le serveur » sans le dire. Sans choix
/// enregistré et avec un seul groupe, ce groupe est actif ; avec plusieurs,
/// le premier est proposé et la barre supérieure permet d'en changer.
final class ActiveGroupController extends ChangeNotifier {
  ActiveGroupController(
    this._groups,
    this._session, {
    Future<String?> Function()? readChoice,
    Future<void> Function(String? id)? writeChoice,
  })  : _readChoice = readChoice ?? _defaultRead,
        _writeChoice = writeChoice ?? _defaultWrite {
    _session.addListener(_onSession);
    _onSession();
  }

  static const String _key = 'kombe.groupe_actif';
  static Future<String?> _defaultRead() => SharedPreferencesAsync().getString(_key);
  static Future<void> _defaultWrite(String? id) =>
      id == null ? SharedPreferencesAsync().remove(_key) : SharedPreferencesAsync().setString(_key, id);

  final GroupRepository _groups;
  final SessionController _session;
  final Future<String?> Function() _readChoice;
  final Future<void> Function(String? id) _writeChoice;

  Resource<List<GroupSummary>> groups = const ResourceLoading<List<GroupSummary>>();
  String? _chosenId;
  SessionStateKind? _lastKind;

  List<GroupSummary> get list => switch (groups) {
        ResourceReady<List<GroupSummary>>(:final List<GroupSummary> data) => data,
        _ => const <GroupSummary>[],
      };

  GroupSummary? get active {
    final List<GroupSummary> l = list;
    if (l.isEmpty) return null;
    return l.where((GroupSummary g) => g.id == _chosenId).firstOrNull ?? l.first;
  }

  /// Fonction de bureau dans le groupe actif (accès aux outils du bureau).
  bool get isBureau => (active?.role ?? GroupRole.member) != GroupRole.member;

  void _onSession() {
    final SessionStateKind kind = _session.kind;
    if (kind == _lastKind) return;
    _lastKind = kind;
    if (kind == SessionStateKind.signedIn) {
      unawaited(refresh());
    } else if (kind == SessionStateKind.signedOut) {
      // Rien d'une session ne survit à la déconnexion.
      groups = const ResourceLoading<List<GroupSummary>>();
      _chosenId = null;
      unawaited(_writeChoice(null));
      notifyListeners();
    }
  }

  Future<void> refresh() async {
    _chosenId ??= await _readChoice();
    final Resource<List<GroupSummary>> next = await _groups.listGroups();
    // Une erreur de rafraîchissement ne vide pas ce qui est déjà affiché.
    if (next is ResourceReady<List<GroupSummary>> || groups is! ResourceReady<List<GroupSummary>>) groups = next;
    notifyListeners();
  }

  Future<void> select(String groupId) async {
    _chosenId = groupId;
    notifyListeners();
    await _writeChoice(groupId);
  }

  @override
  void dispose() {
    _session.removeListener(_onSession);
    super.dispose();
  }
}
