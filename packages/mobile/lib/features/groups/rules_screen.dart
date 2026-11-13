import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/design/kombe_spacing.dart';
import '../../core/design/kombe_theme.dart';
import '../../core/formatters/douala_time.dart';
import '../../core/state/operation_result.dart';
import '../../core/state/resource.dart';
import '../../core/widgets/kombe_components.dart';
import '../../core/widgets/operation_feedback.dart';
import '../../core/widgets/screen_states.dart';
import '../../core/widgets/section_card.dart';
import '../../domain/entities/group.dart';
import '../../domain/repositories/group_repository.dart';
import '../../l10n/app_localizations.dart';
import '../../l10n/kombe_l10n.dart';

/// Phrase d'échéance montrée aux membres qui n'ont pas encore accepté.
String statutesDeadlineSentence(DateTime deadlineUtc, StatutesOnExpiry onExpiry) {
  final String when = DoualaTime.dateTime(deadlineUtc);
  return onExpiry == StatutesOnExpiry.exclude
      ? KombeL10n.current.ruAcceptezAvantLePasseCe(when)
      : KombeL10n.current.ruAcceptezAvantLePasseCe2(when);
}

/// Statuts du groupe : lecture et acceptation de la dernière version ; pour
/// le bureau, publication (délai et conséquence), suivi des retardataires,
/// relance et prolongation de l'échéance.
class RulesScreen extends StatefulWidget {
  const RulesScreen({required this.groupId, super.key});
  final String groupId;

  @override
  State<RulesScreen> createState() => _RulesScreenState();
}

class _RulesScreenState extends State<RulesScreen> {
  Resource<TontineStatutes?> _state = const ResourceLoading<TontineStatutes?>();
  GroupSummary? _group;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final GroupRepository repo = context.read<GroupRepository>();
    final (Resource<TontineStatutes?>, Resource<GroupDetails>) r = await (repo.getStatutes(widget.groupId), repo.getGroup(widget.groupId)).wait;
    if (!mounted) return;
    setState(() {
      _state = r.$1;
      if (r.$2 case ResourceReady<GroupDetails>(:final GroupDetails data)) _group = data.summary;
    });
  }

  Future<void> _run<T>(Future<OperationResult<T>> Function(GroupRepository repo) action, String Function(T value) done) async {
    setState(() => _busy = true);
    final OperationResult<T> r = await action(context.read<GroupRepository>());
    if (!mounted) return;
    setState(() => _busy = false);
    if (r case OperationSuccess<T>(:final T value)) {
      showKombeMessage(context, done(value));
      await _load();
    } else {
      reportOutcome(context, r);
    }
  }

  Future<void> _publish({required bool first}) async {
    final ({int days, StatutesOnExpiry onExpiry})? choice = await showDialog<({int days, StatutesOnExpiry onExpiry})>(
      context: context,
      builder: (_) => _DeadlineDialog(
        title: first ? AppLocalizations.of(context).ruPublierLesStatuts : AppLocalizations.of(context).ruPublierUneNouvelleVersion,
        intro: AppLocalizations.of(context).ruLesStatutsSontRedigesPartir,
        daysLabel: AppLocalizations.of(context).ruDelaiPourAccepter,
        minDays: 1,
        initialDays: 7,
        confirm: AppLocalizations.of(context).ruPublier,
      ),
    );
    if (choice == null || !mounted) return;
    await _run<TontineStatutes>(
      (GroupRepository repo) => repo.publishStatutes(groupId: widget.groupId, acceptanceDays: choice.days, onExpiry: choice.onExpiry),
      (TontineStatutes s) => AppLocalizations.of(context).ruStatutsVersionPubliesLesMembres(s.version),
    );
  }

  Future<void> _extend(TontineStatutes s) async {
    final ({int days, StatutesOnExpiry onExpiry})? choice = await showDialog<({int days, StatutesOnExpiry onExpiry})>(
      context: context,
      builder: (_) => _DeadlineDialog(
        title: AppLocalizations.of(context).ruRepousserLecheance,
        intro: s.deadline == null
            ? AppLocalizations.of(context).ruAucuneEcheanceNestFixeeChoisissez
            : AppLocalizations.of(context).ruEcheanceActuelle(DoualaTime.dateTime(s.deadline!.deadlineAtUtc)),
        daysLabel: AppLocalizations.of(context).ruJoursEnPlus,
        minDays: 1,
        initialDays: 7,
        initialOnExpiry: s.deadline?.onExpiry ?? StatutesOnExpiry.exclude,
        confirm: AppLocalizations.of(context).ruRepousser,
      ),
    );
    if (choice == null || !mounted) return;
    await _run<TontineStatutes>(
      (GroupRepository repo) =>
          repo.extendStatutesDeadline(groupId: widget.groupId, extendDays: choice.days, onExpiry: choice.onExpiry),
      (TontineStatutes v) => v.deadline == null
          ? AppLocalizations.of(context).ruEcheanceMiseJour
          : AppLocalizations.of(context).ruNouvelleEcheanceLesRetardatairesSont(DoualaTime.dateTime(v.deadline!.deadlineAtUtc)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final bool bureau = _group?.can(TontineAct.publishStatutes) ?? false;
    return Scaffold(
      appBar: AppBar(title: Text(AppLocalizations.of(context).ruStatutsDuGroupe)),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ResourceView<TontineStatutes?>(
          resource: _state,
          builder: (BuildContext context, TontineStatutes? s) {
            final TextTheme t = Theme.of(context).textTheme;
            if (s == null) {
              return ListView(
                padding: const EdgeInsets.all(20),
                children: <Widget>[
                  KombeFormHeader(
                    icon: Icons.menu_book_outlined,
                    tone: KombeTone.info,
                    title: AppLocalizations.of(context).ruPasEncoreDeStatuts,
                    body: bureau
                        ? AppLocalizations.of(context).ruPubliezLesStatutsDesQue
                        : AppLocalizations.of(context).ruLeBureauNaPasEncore,
                  ),
                  if (bureau) ...<Widget>[
                    FilledButton.icon(
                      onPressed: _busy ? null : () => _publish(first: true),
                      icon: const Icon(Icons.publish_rounded),
                      label: Text(AppLocalizations.of(context).ruPublierLesStatuts),
                    ),
                  ],
                ],
              );
            }
            return ListView(
              padding: const EdgeInsets.all(20),
              children: <Widget>[
                Semantics(header: true, child: Text(s.title.isEmpty ? AppLocalizations.of(context).catStatuts : s.title, style: KombeType.display(size: 26))),
                const SizedBox(height: 4),
                Text(AppLocalizations.of(context).ruVersionPublieeLe(s.version, DoualaTime.date(s.publishedAtUtc)), style: t.bodySmall),
                const SizedBox(height: 16),
                _MyAcceptance(
                  statutes: s,
                  busy: _busy,
                  onAccept: () => _run<TontineStatutes>(
                    (GroupRepository repo) => repo.acceptStatutes(groupId: widget.groupId, hash: s.hash),
                    (_) => AppLocalizations.of(context).ruMerciVotreAcceptationEstEnregistree,
                  ),
                ),
                const SizedBox(height: 12),
                Text(AppLocalizations.of(context).ruSurOntAccepte(s.acceptedCount, s.expectedCount), style: t.titleSmall),
                const SizedBox(height: 6),
                ClipRRect(
                  borderRadius: BorderRadius.circular(99),
                  child: LinearProgressIndicator(
                    value: s.expectedCount == 0 ? 0 : (s.acceptedCount / s.expectedCount).clamp(0, 1).toDouble(),
                    minHeight: 6,
                  ),
                ),
                if (bureau) ...<Widget>[
                  const SizedBox(height: 20),
                  _BureauPanel(
                    statutes: s,
                    busy: _busy,
                    onRemind: () => _run<int>(
                      (GroupRepository repo) => repo.remindStatutes(widget.groupId),
                      (int n) => n == 0 ? AppLocalizations.of(context).ruPersonneRelancerPourLeMoment : AppLocalizations.of(context).ruRelanceEnvoyeePersonne(n),
                    ),
                    onExtend: () => _extend(s),
                    onRepublish: () => _publish(first: false),
                  ),
                ],
                KombeSection(AppLocalizations.of(context).ruTexteDesStatuts, padding: EdgeInsets.fromLTRB(0, 24, 0, 8)),
                if (AppLocalizations.of(context).ruDraftedInFrench.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Text(AppLocalizations.of(context).ruDraftedInFrench, style: t.bodySmall),
                  ),
                SectionCard(child: SelectableText(s.body, style: t.bodyMedium)),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _MyAcceptance extends StatelessWidget {
  const _MyAcceptance({required this.statutes, required this.busy, required this.onAccept});
  final TontineStatutes statutes;
  final bool busy;
  final VoidCallback onAccept;

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    final TontineStatutes s = statutes;
    if (s.acceptedByMe) {
      return Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: KombeColors.mint, borderRadius: BorderRadius.circular(KombeSpacing.tileRadius)),
        child: Row(children: <Widget>[
          const Icon(Icons.check_circle_rounded, color: KombeColors.forest),
          const SizedBox(width: 10),
          Expanded(child: Text(AppLocalizations.of(context).ruVousAvezAccepteCetteVersion, style: t.titleSmall?.copyWith(color: KombeColors.forest))),
        ]),
      );
    }
    final DateTime? deadline = s.myDeadlineAtUtc ?? s.deadline?.deadlineAtUtc;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: KombeColors.sand, borderRadius: BorderRadius.circular(KombeSpacing.tileRadius)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Text(AppLocalizations.of(context).ruAccepter, style: t.titleMedium),
          const SizedBox(height: 6),
          Text(
            deadline == null
                ? AppLocalizations.of(context).ruLisezLesStatutsCiDessous
                : statutesDeadlineSentence(deadline, s.deadline?.onExpiry ?? StatutesOnExpiry.exclude),
          ),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: busy ? null : onAccept,
            child: Text(AppLocalizations.of(context).ruJaiLuEtJaccepteCes),
          ),
        ],
      ),
    );
  }
}

class _BureauPanel extends StatelessWidget {
  const _BureauPanel({
    required this.statutes,
    required this.busy,
    required this.onRemind,
    required this.onExtend,
    required this.onRepublish,
  });

  final TontineStatutes statutes;
  final bool busy;
  final VoidCallback onRemind;
  final VoidCallback onExtend;
  final VoidCallback onRepublish;

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    final TontineStatutes s = statutes;
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Text(AppLocalizations.of(context).ruPourLeBureau, style: t.titleMedium),
          const SizedBox(height: 4),
          Text(
            s.deadline == null
                ? AppLocalizations.of(context).ruAucuneEcheanceFixee
                : (s.deadline!.onExpiry == StatutesOnExpiry.exclude
                    ? AppLocalizations.of(context).ruDeadlineExclude(DoualaTime.dateTime(s.deadline!.deadlineAtUtc))
                    : AppLocalizations.of(context).ruDeadlineNotify(DoualaTime.dateTime(s.deadline!.deadlineAtUtc))),
            style: t.bodySmall,
          ),
          const SizedBox(height: 10),
          if (s.pending.isEmpty)
            Text(AppLocalizations.of(context).ruToutLeMondeAccepteLe)
          else ...<Widget>[
            Text(AppLocalizations.of(context).ruPasEncoreAccepte(s.pending.length), style: t.titleSmall),
            for (final StatutesPendingSigner p in s.pending)
              ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.hourglass_empty_rounded, size: 20),
                title: Text(p.name.isEmpty ? AppLocalizations.of(context).roleMemberLabel : p.name),
                subtitle: Text(<String>[
                  if (p.state == 'pending') AppLocalizations.of(context).ruCandidatPasEncoreAdmis,
                  if (p.deadlineAtUtc != null) AppLocalizations.of(context).ruAvantLe(DoualaTime.dateTime(p.deadlineAtUtc)),
                ].join(' · ')),
              ),
          ],
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: <Widget>[
              if (s.pending.isNotEmpty)
                FilledButton.tonalIcon(
                  onPressed: busy ? null : onRemind,
                  icon: const Icon(Icons.notifications_active_outlined),
                  label: Text(AppLocalizations.of(context).ruRelancer),
                ),
              OutlinedButton.icon(
                onPressed: busy ? null : onExtend,
                icon: const Icon(Icons.update_rounded),
                label: Text(AppLocalizations.of(context).ruRepousserLecheance),
              ),
              TextButton(
                onPressed: busy ? null : onRepublish,
                child: Text(AppLocalizations.of(context).ruRepublierApresUnChangementDu),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Choix d'un délai en jours (1 à 60) et de la conséquence à l'échéance.
class _DeadlineDialog extends StatefulWidget {
  const _DeadlineDialog({
    required this.title,
    required this.intro,
    required this.daysLabel,
    required this.minDays,
    required this.initialDays,
    required this.confirm,
    this.initialOnExpiry = StatutesOnExpiry.exclude,
  });

  final String title;
  final String intro;
  final String daysLabel;
  final int minDays;
  final int initialDays;
  final String confirm;
  final StatutesOnExpiry initialOnExpiry;

  @override
  State<_DeadlineDialog> createState() => _DeadlineDialogState();
}

class _DeadlineDialogState extends State<_DeadlineDialog> {
  late int _days = widget.initialDays;
  late StatutesOnExpiry _onExpiry = widget.initialOnExpiry;

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: Text(widget.title),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(widget.intro),
              const SizedBox(height: 14),
              Text(AppLocalizations.of(context).ruDaysCount(widget.daysLabel, _days)),
              Slider(
                value: _days.toDouble(),
                min: widget.minDays.toDouble(),
                max: 60,
                divisions: 60 - widget.minDays,
                label: '$_days',
                onChanged: (double v) => setState(() => _days = v.round()),
              ),
              Text(AppLocalizations.of(context).ruLecheanceCeuxQuiNontPas),
              RadioGroup<StatutesOnExpiry>(
                groupValue: _onExpiry,
                onChanged: (StatutesOnExpiry? v) => setState(() => _onExpiry = v ?? _onExpiry),
                child: Column(
                  children: <Widget>[
                    RadioListTile<StatutesOnExpiry>(
                      contentPadding: EdgeInsets.zero,
                      value: StatutesOnExpiry.exclude,
                      title: Text(AppLocalizations.of(context).ruSontExclusAvantLeDemarrage),
                    ),
                    RadioListTile<StatutesOnExpiry>(
                      contentPadding: EdgeInsets.zero,
                      value: StatutesOnExpiry.keep,
                      title: Text(AppLocalizations.of(context).ruRestentMembresLeBureauEst),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        actions: <Widget>[
          TextButton(onPressed: () => Navigator.of(context).pop(), child: Text(AppLocalizations.of(context).cancel)),
          FilledButton(
            onPressed: () => Navigator.of(context).pop((days: _days, onExpiry: _onExpiry)),
            child: Text(widget.confirm),
          ),
        ],
      );
}
