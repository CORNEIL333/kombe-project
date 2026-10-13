import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/formatters/labels.dart';
import '../../core/widgets/screen_states.dart';
import '../../core/widgets/section_card.dart';
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
            builder: (BuildContext context, GroupMember member) => ListView(
              padding: const EdgeInsets.all(20),
              children: <Widget>[
                const CircleAvatar(
                  radius: 42,
                  backgroundColor: KombeColors.mint,
                  foregroundColor: KombeColors.forest,
                  child: Icon(Icons.person, size: 42),
                ),
                const SizedBox(height: 16),
                Text(
                  member.displayName,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.headlineMedium,
                ),
                const SizedBox(height: 6),
                Text(
                  KombeLabels.role(member.role),
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodyLarge,
                ),
                const SizedBox(height: 24),
                SectionCard(
                  child: Column(
                    children: <Widget>[
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: const Icon(Icons.badge_outlined),
                        title: const Text('Rôle'),
                        trailing: Text(KombeLabels.role(member.role)),
                      ),
                      const Divider(),
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: const Icon(Icons.calendar_today_outlined),
                        title: const Text('Membre depuis'),
                        trailing: Text(
                          DateFormat.yMMMd(
                            Localizations.localeOf(context).toLanguageTag(),
                          ).format(member.joinedAtUtc.toLocal()),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      );
}
