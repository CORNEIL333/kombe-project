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
      showKombeMessage(context, 'Contestation envoyée : la présidence va trancher.');
      await _load();
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Mes amendes')),
        body: RefreshIndicator(
          onRefresh: _load,
          child: ResourceView<List<MyFine>>(
            resource: _state,
            emptyWhen: (List<MyFine> items) => items.isEmpty,
            emptyTitle: 'Aucune amende',
            emptyBody: 'Aucune amende ne vous a été notifiée dans vos groupes.',
            builder: (BuildContext context, List<MyFine> items) => ListView.separated(
              padding: const EdgeInsets.all(20),
              itemCount: items.length + 1,
              separatorBuilder: (_, _) => const SizedBox(height: 10),
              itemBuilder: (BuildContext context, int index) {
                if (index == 0) {
                  return Text(
                    'Une amende se règle auprès du trésorier, hors de l’application. Si elle vous semble injuste, contestez-la : '
                    'le président ou le vice-président l’annule ou la maintient.',
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
                      if (f.reason.isNotEmpty) ...<Widget>[const SizedBox(height: 6), Text('Motif : ${f.reason}')],
                      if (f.issuedByName != null) Text('Constatée par ${f.issuedByName}', style: t.bodySmall),
                      const SizedBox(height: 8),
                      Text(
                        f.refundDue
                            ? 'Annulée après paiement — la trésorerie vous rembourse'
                            : f.refundedAtUtc != null
                                ? 'Annulée — remboursée le ${DoualaTime.date(f.refundedAtUtc!)}'
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
                            label: const Text('Contester cette amende'),
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
        title: const Text('Contester une amende'),
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
                labelText: 'Pourquoi la contestez-vous ?',
                errorText: _error,
                border: const OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: <Widget>[
          TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Annuler')),
          FilledButton(
            onPressed: () {
              final String r = _reason.text.trim();
              if (r.length < 3) {
                setState(() => _error = 'Expliquez en quelques mots (3 caractères au moins).');
                return;
              }
              Navigator.of(context).pop(r);
            },
            child: const Text('Envoyer'),
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
      showKombeMessage(context, f.state == FineState.paid ? 'Amende annulée : le remboursement est à faire par la trésorerie.' : 'Amende annulée.');
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
            ListTile(title: Text('Rembourser ${Xaf.format(f.amountXaf)} à ${f.memberName}', style: Theme.of(c).textTheme.titleMedium)),
            for (final (String id, String label) in const <(String, String)>[('cash', 'Espèces'), ('orange_money', 'Orange Money'), ('mtn_momo', 'MTN MoMo')])
              ListTile(leading: const Icon(Icons.payments_outlined), title: Text(label), onTap: () => Navigator.of(c).pop(id)),
          ],
        ),
      ),
    );
    if (channel == null || !mounted) return;
    final OperationResult<MyFine> r = await context.read<FineRepository>().refundFine(
          fine: f,
          channel: channel,
          reference: channel == 'cash' ? null : 'Remboursement amende',
        );
    if (!mounted) return;
    if (reportOutcome(context, r)) {
      showKombeMessage(context, 'Remboursement enregistré : le membre confirmera la réception.');
      await _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    final GroupSummary? g = _group;
    final bool presidency = g?.can(TontineAct.admit) ?? false;
    final bool treasury = g?.can(TontineAct.confirmMovement) ?? false;
    return Scaffold(
      appBar: AppBar(title: const Text('Amendes du groupe')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ResourceView<List<MyFine>>(
          resource: _state,
          emptyWhen: (List<MyFine> items) => items.isEmpty,
          emptyTitle: 'Aucune amende',
          emptyBody: 'Aucune amende n’a été notifiée dans ce groupe.',
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
                          if (f.reason.isNotEmpty) Text('Motif : ${f.reason}'),
                          const SizedBox(height: 6),
                          Text(
                            f.refundDue
                                ? 'Annulée après paiement — à rembourser'
                                : f.refundedAtUtc != null
                                    ? 'Annulée — remboursée le ${DoualaTime.date(f.refundedAtUtc!)}'
                                    : fineStateLabel(f.state),
                            style: t.labelLarge?.copyWith(color: f.refundDue || f.state == FineState.issued ? KombeColors.goldDark : KombeColors.forest),
                          ),
                          Wrap(
                            spacing: 8,
                            alignment: WrapAlignment.end,
                            children: <Widget>[
                              if (treasury && f.refundDue)
                                FilledButton.icon(onPressed: () => _refund(f), icon: const Icon(Icons.payments_outlined), label: const Text('Rembourser')),
                              if (presidency && f.state != FineState.cancelled)
                                OutlinedButton(onPressed: () => _cancel(f), child: const Text('Annuler l’amende')),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                if (items.length > shown.length || _all)
                  TextButton(onPressed: () => setState(() => _all = !_all), child: Text(_all ? 'Voir moins' : 'Tout voir (${items.length})')),
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
        title: const Text('Annuler une amende'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text('${widget.fine.memberName} · ${Xaf.format(widget.fine.amountXaf)}'),
            if (widget.fine.state == FineState.paid) ...<Widget>[
              const SizedBox(height: 8),
              const Text('Cette amende est déjà payée : l’annuler ouvre un remboursement que la trésorerie remettra au membre.'),
            ],
            const SizedBox(height: 12),
            TextField(
              controller: _reason,
              autofocus: true,
              maxLength: 500,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(labelText: 'Motif', border: OutlineInputBorder()),
            ),
          ],
        ),
        actions: <Widget>[
          TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Retour')),
          FilledButton(
            onPressed: _reason.text.trim().length < 3 ? null : () => Navigator.of(context).pop(_reason.text.trim()),
            child: const Text('Annuler l’amende'),
          ),
        ],
      );
}
