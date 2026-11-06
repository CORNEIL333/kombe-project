import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/formatters/douala_time.dart';
import '../../core/formatters/xaf.dart';
import '../../core/state/operation_result.dart';
import '../../core/state/resource.dart';
import '../../core/widgets/kombe_components.dart';
import '../../core/widgets/operation_feedback.dart';
import '../../core/widgets/screen_states.dart';
import '../../domain/entities/share_name.dart';
import '../../domain/repositories/share_name_repository.dart';

/// Les « noms » du cycle (0041) : chaque nom est une part à part entière,
/// avec sa cotisation et son tour. Le titulaire ou le bureau le renomme.
class ShareNamesScreen extends StatefulWidget {
  const ShareNamesScreen({super.key, required this.groupId});
  final String groupId;

  @override
  State<ShareNamesScreen> createState() => _ShareNamesScreenState();
}

class _ShareNamesScreenState extends State<ShareNamesScreen> {
  Resource<List<ShareName>> _state = const ResourceLoading<List<ShareName>>();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final Resource<List<ShareName>> next = await context.read<ShareNameRepository>().listNames(widget.groupId);
    if (mounted) setState(() => _state = next);
  }

  Future<void> _rename(ShareName n) async {
    final TextEditingController c = TextEditingController(text: n.label);
    final String? label = await showDialog<String>(
      context: context,
      builder: (BuildContext d) => AlertDialog(
        title: const Text('Renommer ce nom'),
        content: TextField(controller: c, autofocus: true, maxLength: 40, decoration: const InputDecoration(labelText: 'Nom affiché')),
        actions: <Widget>[
          TextButton(onPressed: () => Navigator.of(d).pop(), child: const Text('Annuler')),
          FilledButton(onPressed: () => Navigator.of(d).pop(c.text.trim()), child: const Text('Enregistrer')),
        ],
      ),
    );
    c.dispose();
    if (label == null || label.isEmpty || label == n.label || !mounted) return;
    final OperationResult<ShareName> r = await context.read<ShareNameRepository>().rename(groupId: widget.groupId, shareId: n.shareId, label: label);
    if (!mounted) return;
    if (reportOutcome(context, r)) await _load();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Les noms du cycle')),
        body: RefreshIndicator(
          onRefresh: _load,
          child: ResourceView<List<ShareName>>(
            resource: _state,
            emptyWhen: (List<ShareName> items) => items.isEmpty,
            emptyTitle: 'Aucun nom',
            emptyBody: 'Les noms apparaissent au démarrage du cycle.',
            builder: (BuildContext context, List<ShareName> items) => ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
              children: <Widget>[
                Text(
                  'Chaque nom est une part à part entière : il a sa cotisation et son tour. Un membre peut tenir plusieurs noms.',
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
                const SizedBox(height: 12),
                KombeGroupedList(
                  children: <Widget>[
                    for (final ShareName n in items)
                      ListTile(
                        minTileHeight: 64,
                        title: Text(n.label, maxLines: 1, overflow: TextOverflow.ellipsis),
                        subtitle: Text(<String>[
                          n.holders.join(' & '),
                          Xaf.format(n.contributionXaf),
                          if (n.roundSeq != null) 'tour ${n.roundSeq}${n.roundDate != null ? ' le ${DoualaTime.date(n.roundDate!)}' : ''}',
                        ].join(' · ')),
                        trailing: n.canRename ? IconButton(tooltip: 'Renommer', onPressed: () => _rename(n), icon: const Icon(Icons.edit_outlined)) : null,
                      ),
                  ],
                ),
              ],
            ),
          ),
        ),
      );
}
