import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/state/operation_result.dart';
import '../../core/widgets/server_action_guard.dart';
import '../../domain/repositories/group_repository.dart';
import '../auth/auth_validators.dart';

class InviteMemberScreen extends StatefulWidget {
  const InviteMemberScreen({required this.groupId, super.key});
  final String groupId;

  @override
  State<InviteMemberScreen> createState() => _InviteMemberScreenState();
}

class _InviteMemberScreenState extends State<InviteMemberScreen> {
  final TextEditingController _phone = TextEditingController();

  @override
  void dispose() {
    _phone.dispose();
    super.dispose();
  }

  Future<void> _invite() async {
    if (!AuthValidators.isCameroonLocalPhone(_phone.text)) return;
    final OperationResult<void> result =
        await context.read<GroupRepository>().inviteMember(
              groupId: widget.groupId,
              phoneE164: '+237${_phone.text.replaceAll(RegExp(r'\s+'), '')}',
            );
    if (!mounted) return;
    switch (result) {
      case OperationSuccess<void>():
        Navigator.of(context).pop();
      case OperationBlocked<void>():
        await showServerAuthorityRequired(context);
      case OperationFailure<void>(:final error):
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.toString())));
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Inviter un membre')),
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.all(24),
            children: <Widget>[
              const Text(
                'L’invitation est créée par le serveur. Le mobile ne génère aucun membre ni invitation localement.',
              ),
              const SizedBox(height: 22),
              TextField(
                controller: _phone,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(
                  labelText: 'Téléphone',
                  prefixText: '+237  ',
                ),
              ),
              const SizedBox(height: 20),
              FilledButton(onPressed: _invite, child: const Text('Envoyer l’invitation')),
            ],
          ),
        ),
      );
}
