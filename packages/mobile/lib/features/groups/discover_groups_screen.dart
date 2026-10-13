import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../app/session_controller.dart';
import '../../core/state/operation_result.dart';
import '../../core/state/resource.dart';
import '../../core/widgets/screen_states.dart';
import '../../core/widgets/server_action_guard.dart';
import '../../domain/entities/group.dart';
import '../../domain/repositories/group_repository.dart';

/// Découvrabilité publique (C03 §4.1) : liste des tontines ouvertes au public,
/// SANS registre réel (nom + modèle + typologie seulement). Chaque carte offre
/// le PARCOURS PARRAINAGE / cooptation qui manquait : un candidat demande à
/// rejoindre sous la caution d'un membre actif. Le serveur résout l'identité du
/// candidat depuis la session (le `candidateId` transmis n'est qu'un reflet du
/// contrat de schéma, jamais une identité choisie par le client).
class DiscoverGroupsScreen extends StatefulWidget {
  const DiscoverGroupsScreen({super.key});

  @override
  State<DiscoverGroupsScreen> createState() => _DiscoverGroupsScreenState();
}

class _DiscoverGroupsScreenState extends State<DiscoverGroupsScreen> {
  Resource<List<DiscoverableGroup>> _state =
      const ResourceLoading<List<DiscoverableGroup>>();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _state = const ResourceLoading<List<DiscoverableGroup>>());
    final Resource<List<DiscoverableGroup>> next =
        await context.read<GroupRepository>().listDiscoverable();
    if (!mounted) return;
    setState(() => _state = next);
  }

  Future<void> _requestSponsorship(DiscoverableGroup group) async {
    final String? candidateId =
        context.read<SessionController>().session?.identityId;
    if (candidateId == null || candidateId.isEmpty) {
      await showServerAuthorityRequired(context);
      return;
    }
    final String? sponsorId = await showDialog<String>(
      context: context,
      builder: (BuildContext dialogContext) =>
          _SponsorDialog(groupName: group.name),
    );
    if (sponsorId == null || sponsorId.trim().isEmpty || !mounted) return;

    final OperationResult<void> result =
        await context.read<GroupRepository>().requestSponsorship(
              groupId: group.groupId,
              sponsorshipId: _generateSponsorshipId(),
              candidateId: candidateId,
              sponsorId: sponsorId.trim(),
            );
    if (!mounted) return;
    switch (result) {
      case OperationSuccess<void>():
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Demande de parrainage transmise pour « ${group.name} ».')),
        );
      case OperationBlocked<void>():
        await showServerAuthorityRequired(context);
      case OperationFailure<void>(:final error):
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Parrainage refusé : ${_explain(error)}')),
        );
    }
  }

  static String _explain(Object error) {
    final String s = error.toString();
    if (s.contains('SPONSOR_SELF_FORBIDDEN')) return 'on ne peut pas se parrainer soi-même.';
    if (s.contains('SPONSOR_NOT_ACTIVE_MEMBER')) return 'le parrain indiqué n’est pas membre actif.';
    if (s.contains('SPONSORSHIP_ALREADY_OPEN')) return 'une demande est déjà ouverte pour vous.';
    if (s.contains('UNAUTHENTICATED') || s.contains('401')) return 'session requise (reconnectez-vous).';
    return 'la demande a été refusée par le serveur.';
  }

  static String _generateSponsorshipId() {
    final int rand = math.Random.secure().nextInt(1 << 30);
    return 'spn-${DateTime.now().toUtc().microsecondsSinceEpoch}-$rand';
  }

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Découvrir des tontines')),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _load,
          child: ResourceView<List<DiscoverableGroup>>(
            resource: _state,
            emptyWhen: (List<DiscoverableGroup> g) => g.isEmpty,
            emptyTitle: 'Aucune tontine publique',
            emptyBody:
                'Aucune tontine n’est ouverte à la découverte pour le moment.',
            builder: (BuildContext context, List<DiscoverableGroup> groups) =>
                ListView.separated(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 100),
              itemCount: groups.length,
              separatorBuilder: (_, __) => const SizedBox(height: 12),
              itemBuilder: (BuildContext context, int i) {
                final DiscoverableGroup g = groups[i];
                return Card(
                  child: ListTile(
                    contentPadding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 8),
                    title: Text(g.name,
                        style: t.titleMedium
                            ?.copyWith(fontWeight: FontWeight.w600)),
                    subtitle: Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Wrap(
                        spacing: 8,
                        runSpacing: 6,
                        children: <Widget>[
                          _Chip(label: tontineModelLabel(g.tontineModel)),
                          _Chip(label: rotationTypeLabel(g.rotationType)),
                        ],
                      ),
                    ),
                    trailing: TextButton(
                      onPressed: () => _requestSponsorship(g),
                      child: const Text('Parrainage'),
                    ),
                  ),
                );
              },
            ),
          ),
        ),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) => Chip(
        label: Text(label, style: Theme.of(context).textTheme.bodySmall),
        visualDensity: VisualDensity.compact,
        padding: EdgeInsets.zero,
      );
}

class _SponsorDialog extends StatefulWidget {
  const _SponsorDialog({required this.groupName});
  final String groupName;

  @override
  State<_SponsorDialog> createState() => _SponsorDialogState();
}

class _SponsorDialogState extends State<_SponsorDialog> {
  final TextEditingController _sponsor = TextEditingController();

  @override
  void dispose() {
    _sponsor.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: Text('Demander un parrainage'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text('Pour rejoindre « ${widget.groupName} », indiquez l’identifiant '
                'du membre qui vous parraine. Le serveur vérifiera qu’il est '
                'bien membre actif — vous ne pouvez pas vous parrainer vous-même.'),
            const SizedBox(height: 16),
            TextField(
              controller: _sponsor,
              autofocus: true,
              decoration: const InputDecoration(
                labelText: 'Identifiant du parrain',
                prefixIcon: Icon(Icons.person_outline),
              ),
            ),
          ],
        ),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Annuler'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(_sponsor.text),
            child: const Text('Envoyer la demande'),
          ),
        ],
      );
}
