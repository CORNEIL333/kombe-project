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
import '../../domain/repositories/fine_repository.dart';

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
                        fineStateLabel(f.state),
                        style: t.labelLarge?.copyWith(color: f.state == FineState.issued ? KombeColors.goldDark : KombeColors.forest),
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
