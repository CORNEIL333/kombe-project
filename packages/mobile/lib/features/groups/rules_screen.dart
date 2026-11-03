import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/state/resource.dart';
import '../../core/widgets/screen_states.dart';
import '../../core/design/kombe_colors.dart';
import '../../core/design/kombe_theme.dart';
import '../../core/widgets/kombe_components.dart';
import '../../domain/repositories/group_repository.dart';

class RulesScreen extends StatefulWidget {
  const RulesScreen({required this.groupId, super.key});
  final String groupId;

  @override
  State<RulesScreen> createState() => _RulesScreenState();
}

class _RulesScreenState extends State<RulesScreen> {
  Resource<List<String>> _state = const ResourceLoading<List<String>>();

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _load();
  }

  Future<void> _load() async {
    final Resource<List<String>> state =
        await context.read<GroupRepository>().getRules(widget.groupId);
    if (mounted) setState(() => _state = state);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Statuts du groupe')),
        body: ResourceView<List<String>>(
          resource: _state,
          onRetry: _load,
          emptyWhen: (List<String> rules) => rules.isEmpty,
          emptyTitle: 'Statuts non publiés',
          emptyBody: 'Le bureau n’a pas encore publié les règles de ce groupe.',
          builder: (BuildContext context, List<String> rules) => ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
            children: <Widget>[
              Text('Les règles que tout le groupe a acceptées.', style: Theme.of(context).textTheme.bodyMedium),
              const SizedBox(height: 16),
              // Mise en page de document : articles numérotés, filet entre eux.
              KombeCard(
                padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 6),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: <Widget>[
                    for (int i = 0; i < rules.length; i++) ...<Widget>[
                      if (i > 0) const Divider(),
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: <Widget>[
                            SizedBox(width: 36, child: Text('${i + 1}', style: KombeType.amount(size: 22, color: KombeColors.goldDark))),
                            Expanded(child: Text(rules[i], style: Theme.of(context).textTheme.bodyLarge)),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      );
}
