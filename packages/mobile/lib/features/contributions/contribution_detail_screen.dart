import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/formatters/xaf.dart';
import '../../core/state/resource.dart';
import '../../core/widgets/screen_states.dart';
import '../../core/widgets/section_card.dart';
import '../../domain/entities/contribution.dart';
import '../../domain/repositories/contribution_repository.dart';

class ContributionDetailScreen extends StatefulWidget {
  const ContributionDetailScreen({required this.contributionId, super.key});
  final String contributionId;

  @override
  State<ContributionDetailScreen> createState() => _ContributionDetailScreenState();
}

class _ContributionDetailScreenState extends State<ContributionDetailScreen> {
  Resource<Contribution> _state = const ResourceLoading<Contribution>();

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _load();
  }

  Future<void> _load() async {
    final Resource<Contribution> state =
        await context.read<ContributionRepository>().getContribution(widget.contributionId);
    if (mounted) setState(() => _state = state);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Détail de cotisation')),
        body: ResourceView<Contribution>(
          resource: _state,
          builder: (BuildContext context, Contribution contribution) => ListView(
            padding: const EdgeInsets.all(20),
            children: <Widget>[
              SectionCard(
                child: Column(
                  children: <Widget>[
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Montant'),
                      trailing: Text(
                        Xaf.format(contribution.amountXaf),
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                    ),
                    const Divider(),
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Statut'),
                      trailing: Text(contribution.status.name),
                    ),
                    const Divider(),
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Canal déclaré'),
                      trailing: Text(contribution.channel.name),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      );
}
