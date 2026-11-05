import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/formatters/labels.dart';
import '../../core/widgets/screen_states.dart';
import '../../core/widgets/kombe_components.dart';
import '../../core/widgets/group_avatar.dart';
import '../../domain/entities/group.dart';
import '../../domain/repositories/group_repository.dart';
import 'groups_view_models.dart';

class MemberDetailScreen extends StatefulWidget {
  const MemberDetailScreen({
    required this.groupId,
    required this.identityId,
    super.key,
  });

  final String groupId;
  final String identityId;

  @override
  State<MemberDetailScreen> createState() => _MemberDetailScreenState();
}

class _MemberDetailScreenState extends State<MemberDetailScreen> {
  MemberDetailViewModel? _vm;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _vm ??= MemberDetailViewModel(
      context.read<GroupRepository>(),
      widget.groupId,
      widget.identityId,
    )..load();
  }

  @override
  void dispose() {
    _vm?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Membre')),
        body: ListenableBuilder(
          listenable: _vm!,
          builder: (BuildContext context, Widget? child) =>
              ResourceView<GroupMember>(
            resource: _vm!.state,
            onRetry: _vm!.load,
            builder: (BuildContext context, GroupMember member) => ListView(
              padding: const EdgeInsets.fromLTRB(0, 16, 0, 32),
              children: <Widget>[
                Center(child: MemberAvatar(groupId: widget.groupId, memberId: member.identityId, name: member.displayName, photoVersion: member.photoVersion, size: 112)),
                const SizedBox(height: 14),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: Text(member.displayName, textAlign: TextAlign.center, style: Theme.of(context).textTheme.headlineMedium),
                ),
                const SizedBox(height: 8),
                Center(
                  child: StatusPill(
                    KombeLabels.role(member.role),
                    tone: member.role == GroupRole.member ? KombeTone.brand : KombeTone.money,
                    icon: member.role == GroupRole.member ? Icons.person_outline_rounded : Icons.star_rounded,
                  ),
                ),
                const SizedBox(height: 24),
                KombeGroupedList(
                  children: <Widget>[
                    KombeFact(icon: Icons.badge_outlined, label: 'Fonction', value: KombeLabels.role(member.role)),
                    KombeFact(
                      icon: Icons.event_available_outlined,
                      label: 'Membre depuis',
                      value: DateFormat.yMMMd(Localizations.localeOf(context).toLanguageTag()).format(member.joinedAtUtc.toLocal()),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      );
}
