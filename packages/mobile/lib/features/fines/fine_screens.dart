import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/formatters/douala_time.dart';
import '../../core/formatters/xaf.dart';
import '../../core/state/operation_result.dart';
import '../../core/state/resource.dart';
import '../../core/widgets/operation_feedback.dart';
import '../../core/widgets/screen_states.dart';
import '../../core/widgets/section_card.dart';
import '../../domain/entities/fine.dart';
import '../../domain/entities/group.dart';
import '../../domain/repositories/fine_repository.dart';
import '../../domain/repositories/group_repository.dart';
import '../../l10n/app_localizations.dart';

/// « Mes amendes » : les amendes notifiées dans mes groupes, et la
/// contestation d'une amende qui semble injuste (la présidence tranche).
/// Une amende se règle hors de KÓMBE, auprès du trésorier.
class MyFinesScreen extends StatefulWidget {
  const MyFinesScreen({super.key});

  @override
  State<MyFinesScreen> createState() => _MyFinesScreenState();
}

class _MyFinesScreenState extends State<MyFinesScreen> {
  Resource<List<MyFine>> _state = const ResourceLoading<List<MyFine>>();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final Resource<List<MyFine>> next = await context.read<FineRepository>().listMyFines();
    if (mounted) setState(() => _state = next);
  }

  Future<void> _contest(MyFine fine) async {
    final String? reason = await showDialog<String>(context: context, builder: (_) => _ContestDialog(fine: fine));
    if (reason == null || !mounted) return;
    final OperationResult<MyFine> r = await context.read<FineRepository>().contestFine(fine: fine, reason: reason);
    if (!mounted) return;
    if (reportOutcome(context, r)) {
      showKombeMessage(context, AppLocalizations.of(context).fiContestationEnvoyeeLaPresidenceVa);
      await _load();
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(AppLocalizations.of(context).myFines)),
        body: RefreshIndicator(
          onRefresh: _load,
          child: ResourceView<List<MyFine>>(
            resource: _state,
            emptyWhen: (List<MyFine> items) => items.isEmpty,
            emptyTitle: AppLocalizations.of(context).fiAucuneAmende,
            emptyBody: AppLocalizations.of(context).fiAucuneAmendeNeVousEte,
            builder: (BuildContext context, List<MyFine> items) => ListView.separated(
              padding: const EdgeInsets.all(20),
              itemCount: items.length + 1,
              separatorBuilder: (_, _) => const SizedBox(height: 10),
              itemBuilder: (BuildContext context, int index) {
                if (index == 0) {
                  return Text(
                    AppLocalizations.of(context).fiSettleIntro + AppLocalizations.of(context).fiLePresidentOuLeVice,
                    style: Theme.of(context).textTheme.bodyMedium,
                  );
                }
                final MyFine f = items[index - 1];
                final TextTheme t = Theme.of(context).textTheme;
                return SectionCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Row(
                        children: <Widget>[
                          Expanded(child: Text(fineKindLabel(f.kind), style: t.titleMedium)),
                          Text(Xaf.format(f.amountXaf), style: t.titleMedium),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text('${f.groupName} · ${DoualaTime.date(f.issuedAtUtc)}', style: t.bodySmall),
                      if (f.reason.isNotEmpty) ...<Widget>[const SizedBox(height: 6), Text(AppLocalizations.of(context).fiMotif(f.reason))],
                      if (f.issuedByName != null) Text(AppLocalizations.of(context).fiConstateePar(f.issuedByName!), style: t.bodySmall),
                      const SizedBox(height: 8),
                      Text(
                        f.refundDue
                            ? AppLocalizations.of(context).fiAnnuleeApresPaiementLaTresorerie
                            : f.refundedAtUtc != null
                                ? AppLocalizations.of(context).fiAnnuleeRembourseeLe(DoualaTime.date(f.refundedAtUtc!))
                                : fineStateLabel(f.state),
                        style: t.labelLarge?.copyWith(color: f.state == FineState.issued || f.refundDue ? KombeColors.goldDark : KombeColors.forest),
                      ),
                      if (f.contestable) ...<Widget>[
                        const SizedBox(height: 8),
                        Align(
                          alignment: Alignment.centerRight,
                          child: OutlinedButton.icon(
                            onPressed: () => _contest(f),
                            icon: const Icon(Icons.gavel_outlined),
                            label: Text(AppLocalizations.of(context).fiContesterCetteAmende),
                          ),
                        ),
                      ],
                    ],
                  ),
                );
              },
            ),
          ),
        ),
      );
}

class _ContestDialog extends StatefulWidget {
  const _ContestDialog({required this.fine});
  final MyFine fine;

  @override
  State<_ContestDialog> createState() => _ContestDialogState();
}

class _ContestDialogState extends State<_ContestDialog> {
  final TextEditingController _reason = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: Text(AppLocalizations.of(context).helpFineTitle),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text('${fineKindLabel(widget.fine.kind)} · ${Xaf.format(widget.fine.amountXaf)}'),
            const SizedBox(height: 12),
            TextField(
              controller: _reason,
              autofocus: true,
              maxLength: 500,
              minLines: 2,
              maxLines: 5,
              decoration: InputDecoration(
                labelText: AppLocalizations.of(context).fiPourquoiLaContestezVous,
                errorText: _error,
                border: const OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: <Widget>[
          TextButton(onPressed: () => Navigator.of(context).pop(), child: Text(AppLocalizations.of(context).cancel)),
          FilledButton(
            onPressed: () {
              final String r = _reason.text.trim();
              if (r.length < 3) {
                setState(() => _error = AppLocalizations.of(context).fiExpliquezEnQuelquesMotsCaracteres);
                return;
              }
              Navigator.of(context).pop(r);
            },
            child: Text(AppLocalizations.of(context).send),
          ),
        ],
      );
}

/// Amendes du groupe, vue du bureau (0041) : la présidence annule une
/// amende (payée, elle devient « à rembourser »), la trésorerie rembourse.
/// Les autres décisions (infliger, trancher une contestation) restent aussi
/// possibles à l'Espace bureau.
class GroupFinesScreen extends StatefulWidget {
  const GroupFinesScreen({super.key, required this.groupId});
  final String groupId;

  @override
  State<GroupFinesScreen> createState() => _GroupFinesScreenState();
}

class _GroupFinesScreenState extends State<GroupFinesScreen> {
  Resource<List<MyFine>> _state = const ResourceLoading<List<MyFine>>();
  GroupSummary? _group;
  bool _all = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final Resource<GroupDetails> g = await context.read<GroupRepository>().getGroup(widget.groupId);
    if (!mounted) return;
    final GroupSummary? group = g is ResourceReady<GroupDetails> ? g.data.summary : null;
    final Resource<List<MyFine>> next = await context.read<FineRepository>().listGroupFines(groupId: widget.groupId, groupName: group?.name ?? '');
    if (mounted) {
      setState(() {
        _group = group;
        _state = next;
      });
    }
  }

  Future<void> _cancel(MyFine f) async {
    final String? reason = await showDialog<String>(context: context, builder: (_) => _ReasonDialog(fine: f));
    if (reason == null || !mounted) return;
    final OperationResult<MyFine> r = await context.read<FineRepository>().cancelFine(fine: f, reason: reason);
    if (!mounted) return;
    if (reportOutcome(context, r)) {
      showKombeMessage(context, f.state == FineState.paid ? AppLocalizations.of(context).fiAmendeAnnuleeLeRemboursementEst : AppLocalizations.of(context).fiAmendeAnnulee);
      await _load();
    }
  }

  Future<void> _refund(MyFine f) async {
    final String? channel = await showModalBottomSheet<String>(
      context: context,
      builder: (BuildContext c) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            ListTile(title: Text(AppLocalizations.of(context).fiRembourser(Xaf.format(f.amountXaf), f.memberName), style: Theme.of(c).textTheme.titleMedium)),
            for (final (String id, String label) in <(String, String)>[('cash', AppLocalizations.of(context).cash), ('orange_money', 'Orange Money'), ('mtn_momo', 'MTN MoMo')])
              ListTile(leading: const Icon(Icons.payments_outlined), title: Text(label), onTap: () => Navigator.of(c).pop(id)),
          ],
        ),
      ),
    );
    if (channel == null || !mounted) return;
    final OperationResult<MyFine> r = await context.read<FineRepository>().refundFine(
          fine: f,
          channel: channel,
          reference: channel == 'cash' ? null : AppLocalizations.of(context).fiRemboursementAmende,
        );
    if (!mounted) return;
    if (reportOutcome(context, r)) {
      showKombeMessage(context, AppLocalizations.of(context).fiRemboursementEnregistreLeMembreConfirmera);
      await _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    final GroupSummary? g = _group;
    final bool presidency = g?.can(TontineAct.admit) ?? false;
    final bool treasury = g?.can(TontineAct.confirmMovement) ?? false;
    return Scaffold(
      appBar: AppBar(title: Text(AppLocalizations.of(context).gdAmendesDuGroupe)),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ResourceView<List<MyFine>>(
          resource: _state,
          emptyWhen: (List<MyFine> items) => items.isEmpty,
          emptyTitle: AppLocalizations.of(context).fiAucuneAmende,
          emptyBody: AppLocalizations.of(context).fiAucuneAmendeNaEteNotifiee,
          builder: (BuildContext context, List<MyFine> items) {
            final TextTheme t = Theme.of(context).textTheme;
            // Historique allégé : ce qui attend une action, puis les plus récentes.
            final List<MyFine> pending = items.where((MyFine f) => f.state == FineState.issued || f.state == FineState.contested || f.refundDue).toList();
            final List<MyFine> rest = items.where((MyFine f) => !pending.contains(f)).toList();
            final List<MyFine> shown = _all ? items : <MyFine>[...pending, ...rest.take(5)];
            return ListView(
              padding: const EdgeInsets.all(20),
              children: <Widget>[
                for (final MyFine f in shown)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: SectionCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          Row(
                            children: <Widget>[
                              Expanded(child: Text(f.memberName, style: t.titleMedium)),
                              Text(Xaf.format(f.amountXaf), style: t.titleMedium),
                            ],
                          ),
                          Text('${fineKindLabel(f.kind)} · ${DoualaTime.date(f.issuedAtUtc)}', style: t.bodySmall),
                          if (f.reason.isNotEmpty) Text(AppLocalizations.of(context).fiMotif(f.reason)),
                          const SizedBox(height: 6),
                          Text(
                            f.refundDue
                                ? AppLocalizations.of(context).fiAnnuleeApresPaiementRembourser
                                : f.refundedAtUtc != null
                                    ? AppLocalizations.of(context).fiAnnuleeRembourseeLe(DoualaTime.date(f.refundedAtUtc!))
                                    : fineStateLabel(f.state),
                            style: t.labelLarge?.copyWith(color: f.refundDue || f.state == FineState.issued ? KombeColors.goldDark : KombeColors.forest),
                          ),
                          Wrap(
                            spacing: 8,
                            alignment: WrapAlignment.end,
                            children: <Widget>[
                              if (treasury && f.refundDue)
                                FilledButton.icon(onPressed: () => _refund(f), icon: const Icon(Icons.payments_outlined), label: Text(AppLocalizations.of(context).fiRembourser2)),
                              if (presidency && f.state != FineState.cancelled)
                                OutlinedButton(onPressed: () => _cancel(f), child: Text(AppLocalizations.of(context).fiAnnulerLamende)),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                if (items.length > shown.length || _all)
                  TextButton(onPressed: () => setState(() => _all = !_all), child: Text(_all ? AppLocalizations.of(context).fiVoirMoins : AppLocalizations.of(context).fiToutVoir(items.length))),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _ReasonDialog extends StatefulWidget {
  const _ReasonDialog({required this.fine});
  final MyFine fine;

  @override
  State<_ReasonDialog> createState() => _ReasonDialogState();
}

class _ReasonDialogState extends State<_ReasonDialog> {
  final TextEditingController _reason = TextEditingController();

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: Text(AppLocalizations.of(context).fiAnnulerUneAmende),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text('${widget.fine.memberName} · ${Xaf.format(widget.fine.amountXaf)}'),
            if (widget.fine.state == FineState.paid) ...<Widget>[
              const SizedBox(height: 8),
              Text(AppLocalizations.of(context).fiCetteAmendeEstDejaPayee),
            ],
            const SizedBox(height: 12),
            TextField(
              controller: _reason,
              autofocus: true,
              maxLength: 500,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(labelText: AppLocalizations.of(context).fiMotif2, border: OutlineInputBorder()),
            ),
          ],
        ),
        actions: <Widget>[
          TextButton(onPressed: () => Navigator.of(context).pop(), child: Text(AppLocalizations.of(context).back)),
          FilledButton(
            onPressed: _reason.text.trim().length < 3 ? null : () => Navigator.of(context).pop(_reason.text.trim()),
            child: Text(AppLocalizations.of(context).fiAnnulerLamende),
          ),
        ],
      );
}
