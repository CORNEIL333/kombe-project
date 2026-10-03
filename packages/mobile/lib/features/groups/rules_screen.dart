import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/state/resource.dart';
import '../../core/widgets/screen_states.dart';
import '../../core/widgets/section_card.dart';
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
        appBar: AppBar(title: const Text('Règles du groupe')),
        body: ResourceView<List<String>>(
          resource: _state,
          emptyWhen: (List<String> rules) => rules.isEmpty,
          builder: (BuildContext context, List<String> rules) => ListView(
            padding: const EdgeInsets.all(20),
            children: <Widget>[
              for (int i = 0; i < rules.length; i++) ...<Widget>[
                SectionCard(
                  child: ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: CircleAvatar(child: Text('${i + 1}')),
                    title: Text(rules[i]),
                  ),
                ),
                const SizedBox(height: 10),
              ],
            ],
          ),
        ),
      );
}
