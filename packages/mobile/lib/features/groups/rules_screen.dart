import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/formatters/douala_time.dart';
import '../../core/state/operation_result.dart';
import '../../core/state/resource.dart';
import '../../core/widgets/operation_feedback.dart';
import '../../core/widgets/screen_states.dart';
import '../../core/widgets/section_card.dart';
import '../../domain/entities/group.dart';
import '../../domain/repositories/group_repository.dart';

/// Phrase d'échéance montrée aux membres qui n'ont pas encore accepté.
String statutesDeadlineSentence(DateTime deadlineUtc, StatutesOnExpiry onExpiry) {
  final String when = DoualaTime.dateTime(deadlineUtc);
  return onExpiry == StatutesOnExpiry.exclude
      ? 'Acceptez avant le $when. Passé ce délai, les membres qui n’ont pas accepté sont exclus (avant le démarrage du cycle).'
      : 'Acceptez avant le $when. Passé ce délai, le bureau est prévenu des retards ; personne n’est exclu automatiquement.';
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
        title: first ? 'Publier les statuts' : 'Publier une nouvelle version',
        intro: 'Les statuts sont rédigés à partir du règlement du groupe. Chaque membre doit les accepter avant le démarrage du cycle.',
        daysLabel: 'Délai pour accepter',
        minDays: 1,
        initialDays: 7,
        confirm: 'Publier',
      ),
    );
    if (choice == null || !mounted) return;
    await _run<TontineStatutes>(
      (GroupRepository repo) => repo.publishStatutes(groupId: widget.groupId, acceptanceDays: choice.days, onExpiry: choice.onExpiry),
      (TontineStatutes s) => 'Statuts version ${s.version} publiés : les membres sont prévenus.',
    );
  }

  Future<void> _extend(TontineStatutes s) async {
    final ({int days, StatutesOnExpiry onExpiry})? choice = await showDialog<({int days, StatutesOnExpiry onExpiry})>(
      context: context,
      builder: (_) => _DeadlineDialog(
        title: 'Repousser l’échéance',
        intro: s.deadline == null
            ? 'Aucune échéance n’est fixée : choisissez-en une.'
            : 'Échéance actuelle : ${DoualaTime.dateTime(s.deadline!.deadlineAtUtc)}.',
        daysLabel: 'Jours en plus',
        minDays: 1,
        initialDays: 7,
        initialOnExpiry: s.deadline?.onExpiry ?? StatutesOnExpiry.exclude,
        confirm: 'Repousser',
      ),
    );
    if (choice == null || !mounted) return;
    await _run<TontineStatutes>(
      (GroupRepository repo) =>
          repo.extendStatutesDeadline(groupId: widget.groupId, extendDays: choice.days, onExpiry: choice.onExpiry),
      (TontineStatutes v) => v.deadline == null
          ? 'Échéance mise à jour.'
          : 'Nouvelle échéance : ${DoualaTime.dateTime(v.deadline!.deadlineAtUtc)}. Les retardataires sont prévenus.',
    );
  }

  @override
  Widget build(BuildContext context) {
    final bool bureau = _group?.can(TontineAct.publishStatutes) ?? false;
    return Scaffold(
      appBar: AppBar(title: const Text('Statuts du groupe')),
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
                  Text('Pas encore de statuts', style: t.headlineSmall),
                  const SizedBox(height: 8),
                  Text(
                    bureau
                        ? 'Publiez les statuts dès que le bureau est en place (trésorier désigné) : chaque membre devra les accepter avant le démarrage du cycle.'
                        : 'Le bureau n’a pas encore publié les statuts. Vous serez prévenu pour les lire et les accepter.',
                    style: t.bodyLarge,
                  ),
                  if (bureau) ...<Widget>[
                    const SizedBox(height: 20),
                    FilledButton.icon(
                      onPressed: _busy ? null : () => _publish(first: true),
                      icon: const Icon(Icons.publish_rounded),
                      label: const Text('Publier les statuts'),
                    ),
                  ],
                ],
              );
            }
            return ListView(
              padding: const EdgeInsets.all(20),
              children: <Widget>[
                Text(s.title.isEmpty ? 'Statuts' : s.title, style: t.headlineSmall),
                const SizedBox(height: 4),
                Text('Version ${s.version} · publiée le ${DoualaTime.date(s.publishedAtUtc)}', style: t.bodySmall),
                const SizedBox(height: 16),
                _MyAcceptance(
                  statutes: s,
                  busy: _busy,
                  onAccept: () => _run<TontineStatutes>(
                    (GroupRepository repo) => repo.acceptStatutes(groupId: widget.groupId, hash: s.hash),
                    (_) => 'Merci : votre acceptation est enregistrée.',
                  ),
                ),
                const SizedBox(height: 12),
                Text('${s.acceptedCount} sur ${s.expectedCount} ont accepté', style: t.titleSmall),
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
                      (int n) => n == 0 ? 'Personne à relancer pour le moment.' : 'Relance envoyée à $n personne(s).',
                    ),
                    onExtend: () => _extend(s),
                    onRepublish: () => _publish(first: false),
                  ),
                ],
                const SizedBox(height: 20),
                Text('Texte des statuts', style: t.titleLarge),
                const SizedBox(height: 8),
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
        decoration: BoxDecoration(color: KombeColors.mint, borderRadius: BorderRadius.circular(16)),
        child: Row(children: <Widget>[
          const Icon(Icons.check_circle_rounded, color: KombeColors.forest),
          const SizedBox(width: 10),
          Expanded(child: Text('Vous avez accepté cette version.', style: t.titleSmall?.copyWith(color: KombeColors.forest))),
        ]),
      );
    }
    final DateTime? deadline = s.myDeadlineAtUtc ?? s.deadline?.deadlineAtUtc;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: KombeColors.sand, borderRadius: BorderRadius.circular(16)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Text('À accepter', style: t.titleMedium),
          const SizedBox(height: 6),
          Text(
            deadline == null
                ? 'Lisez les statuts ci-dessous puis acceptez-les : le cycle ne démarre que lorsque chaque membre les a acceptés.'
                : statutesDeadlineSentence(deadline, s.deadline?.onExpiry ?? StatutesOnExpiry.exclude),
          ),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: busy ? null : onAccept,
            child: const Text('J’ai lu et j’accepte ces statuts'),
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
          Text('Pour le bureau', style: t.titleMedium),
          const SizedBox(height: 4),
          Text(
            s.deadline == null
                ? 'Aucune échéance fixée.'
                : 'Échéance : ${DoualaTime.dateTime(s.deadline!.deadlineAtUtc)} · '
                    '${s.deadline!.onExpiry == StatutesOnExpiry.exclude ? 'les retardataires seront exclus (avant le démarrage du cycle)' : 'personne n’est exclu, le bureau est prévenu'}',
            style: t.bodySmall,
          ),
          const SizedBox(height: 10),
          if (s.pending.isEmpty)
            const Text('Tout le monde a accepté : le cycle peut démarrer.')
          else ...<Widget>[
            Text('Pas encore accepté (${s.pending.length})', style: t.titleSmall),
            for (final StatutesPendingSigner p in s.pending)
              ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.hourglass_empty_rounded, size: 20),
                title: Text(p.name.isEmpty ? 'Membre' : p.name),
                subtitle: Text(<String>[
                  if (p.state == 'pending') 'candidat(e) pas encore admis(e)',
                  if (p.deadlineAtUtc != null) 'avant le ${DoualaTime.dateTime(p.deadlineAtUtc)}',
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
                  label: const Text('Relancer'),
                ),
              OutlinedButton.icon(
                onPressed: busy ? null : onExtend,
                icon: const Icon(Icons.update_rounded),
                label: const Text('Repousser l’échéance'),
              ),
              TextButton(
                onPressed: busy ? null : onRepublish,
                child: const Text('Republier après un changement du bureau'),
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
              Text('${widget.daysLabel} : $_days jour${_days > 1 ? 's' : ''}'),
              Slider(
                value: _days.toDouble(),
                min: widget.minDays.toDouble(),
                max: 60,
                divisions: 60 - widget.minDays,
                label: '$_days',
                onChanged: (double v) => setState(() => _days = v.round()),
              ),
              const Text('À l’échéance, ceux qui n’ont pas accepté :'),
              RadioGroup<StatutesOnExpiry>(
                groupValue: _onExpiry,
                onChanged: (StatutesOnExpiry? v) => setState(() => _onExpiry = v ?? _onExpiry),
                child: const Column(
                  children: <Widget>[
                    RadioListTile<StatutesOnExpiry>(
                      contentPadding: EdgeInsets.zero,
                      value: StatutesOnExpiry.exclude,
                      title: Text('sont exclus (avant le démarrage du cycle)'),
                    ),
                    RadioListTile<StatutesOnExpiry>(
                      contentPadding: EdgeInsets.zero,
                      value: StatutesOnExpiry.keep,
                      title: Text('restent membres ; le bureau est prévenu'),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        actions: <Widget>[
          TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Annuler')),
          FilledButton(
            onPressed: () => Navigator.of(context).pop((days: _days, onExpiry: _onExpiry)),
            child: Text(widget.confirm),
          ),
        ],
      );
}
