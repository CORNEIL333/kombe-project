import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../core/state/safe_notifier.dart';

import '../../core/formatters/xaf.dart';
import '../../core/state/resource.dart';
import '../../domain/entities/contribution.dart';
import '../../domain/repositories/contribution_repository.dart';
import '../../domain/repositories/draft_repository.dart';

/// État d'une déclaration : saisie → envoi → issue réelle.
enum DeclarationPhase { editing, sending, done, partial, unknown, failed }

/// Déclaration d'un versement : le brouillon est enregistré à chaque
/// modification (rien ne se perd si l'app est fermée), le plan de répartition
/// est figé AVANT le premier envoi, et une reprise renvoie exactement les
/// mêmes lignes avec les mêmes clés — jamais de doublon.
final class ContributionDraftViewModel extends ChangeNotifier with SafeNotifier {
  ContributionDraftViewModel(this._drafts, this._contributions, this.groupId, {String? localId})
      : _localId = localId;

  final ContributionDraftRepository _drafts;
  final ContributionRepository _contributions;
  final String groupId;
  String? _localId;

  Resource<List<OpenDue>> dues = const ResourceLoading<List<OpenDue>>();
  ContributionDraft? draft;
  DeclarationPhase phase = DeclarationPhase.editing;
  DeclarationReceipt? receipt;
  Timer? _saveTimer;

  int get maxXaf => switch (dues) {
        ResourceReady<List<OpenDue>>(:final List<OpenDue> data) =>
          data.fold<int>(0, (int s, OpenDue d) => s + d.remainingXaf),
        _ => 0,
      };

  /// Plan déjà figé (envoi commencé) : montant et moyen ne sont plus modifiables.
  bool get locked => draft?.sending ?? false;

  Future<void> load() async {
    if (_localId != null) {
      draft = await _drafts.getDraft(_localId!);
      if (draft?.sending ?? false) phase = DeclarationPhase.partial;
    }
    dues = await _contributions.openDues(groupId);
    notifyListeners();
  }

  /// Enregistre la saisie (différé de 400 ms pour ne pas écrire à chaque touche).
  void edit({required int? amountXaf, required PaymentChannel channel, String? reference, String? reason}) {
    if (locked) return;
    final ContributionDraft next = ContributionDraft(
      localId: _localId ??= 'draft-${DateTime.now().toUtc().microsecondsSinceEpoch}',
      groupId: groupId,
      amountXaf: amountXaf ?? 0,
      channel: channel,
      updatedAtUtc: DateTime.now().toUtc(),
      reference: (reference ?? '').trim().isEmpty ? null : reference!.trim(),
      noReferenceReason: (reason ?? '').trim().isEmpty ? null : reason!.trim(),
    );
    draft = next;
    _saveTimer?.cancel();
    _saveTimer = Timer(const Duration(milliseconds: 400), () => unawaited(_drafts.upsertDraft(next)));
  }

  /// Plan proposé pour le récapitulatif (non figé) ; lève [AmountExceedsDue].
  List<DeclarationLine> preview() {
    final ContributionDraft? d = draft;
    if (d == null) return const <DeclarationLine>[];
    if (d.sending) return d.plan;
    return switch (dues) {
      ResourceReady<List<OpenDue>>(:final List<OpenDue> data) => planDeclaration(data, d.amountXaf),
      _ => const <DeclarationLine>[],
    };
  }

  /// Envoie (ou reprend). Le plan est figé et enregistré AVANT tout appel.
  Future<void> send() async {
    final ContributionDraft? d = draft;
    if (d == null || phase == DeclarationPhase.sending) return;
    _saveTimer?.cancel();
    final ContributionDraft frozen = d.sending ? d : d.copyWith(plan: preview());
    if (frozen.plan.isEmpty) return;
    draft = frozen;
    await _drafts.upsertDraft(frozen);
    phase = DeclarationPhase.sending;
    notifyListeners();

    final DeclarationReceipt r = await _contributions.sendDeclaration(frozen);
    receipt = r;
    if (r.complete) {
      await _drafts.deleteDraft(frozen.localId);
      phase = DeclarationPhase.done;
    } else if (r.recordedCount == 0 && !r.outcomeUnknown) {
      // Refus certain, rien d'écrit : on rend la main à la saisie.
      draft = frozen.copyWith(plan: const <DeclarationLine>[]);
      await _drafts.upsertDraft(draft!);
      phase = DeclarationPhase.failed;
    } else {
      // Écriture partielle ou réponse perdue : on garde le plan (et ses clés).
      draft = frozen.copyWith(plan: r.lines);
      await _drafts.upsertDraft(draft!);
      phase = r.outcomeUnknown ? DeclarationPhase.unknown : DeclarationPhase.partial;
    }
    notifyListeners();
  }

  void backToEditing() {
    if (phase == DeclarationPhase.failed) phase = DeclarationPhase.editing;
    notifyListeners();
  }

  /// Abandon explicite d'un brouillon sans aucune ligne enregistrée.
  Future<void> discard() async {
    if (draft != null) await _drafts.deleteDraft(draft!.localId);
  }

  static int? parseAmount(String text) {
    final int? v = Xaf.parseInteger(text);
    return v == null || v <= 0 ? null : v;
  }

  @override
  void dispose() {
    // Dernière saisie conservée même si l'écran se ferme avant le délai.
    if (_saveTimer?.isActive ?? false) {
      _saveTimer!.cancel();
      if (draft != null && !locked) unawaited(_drafts.upsertDraft(draft!));
    }
    super.dispose();
  }
}
