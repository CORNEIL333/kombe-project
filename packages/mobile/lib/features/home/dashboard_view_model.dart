import 'package:flutter/foundation.dart';

import '../../core/state/resource.dart';
import '../../core/state/safe_notifier.dart';
import '../../domain/entities/contribution.dart';
import '../../domain/entities/dashboard.dart';
import '../../domain/entities/group.dart';
import '../../domain/repositories/dashboard_repository.dart';
import '../../domain/repositories/draft_repository.dart';

/// Accueil du groupe actif. Un rafraîchissement garde l'écran affiché (pas
/// de flash de chargement) ; un changement de groupe recharge tout.
final class DashboardViewModel extends ChangeNotifier with SafeNotifier {
  DashboardViewModel(this._repository, this._drafts);

  final DashboardRepository _repository;
  final ContributionDraftRepository _drafts;
  Resource<HomeData> state = const ResourceLoading<HomeData>();
  List<ContributionDraft> drafts = const <ContributionDraft>[];
  String? _groupId;

  Future<void> load(GroupSummary group) async {
    final bool sameGroup = group.id == _groupId;
    _groupId = group.id;
    if (!sameGroup || state is! ResourceReady<HomeData>) {
      state = const ResourceLoading<HomeData>();
      notifyListeners();
    }
    final Resource<HomeData> next = await _repository.loadHome(group);
    if (group.id != _groupId) return; // groupe changé entre-temps
    if (next is ResourceReady<HomeData> || state is! ResourceReady<HomeData>) state = next;
    // Les données serveur s'affichent sans attendre la base locale.
    notifyListeners();
    try {
      drafts = (await _drafts.listDrafts()).where((ContributionDraft d) => d.groupId == group.id).toList();
    } catch (_) {
      drafts = const <ContributionDraft>[];
    }
    notifyListeners();
  }
}
