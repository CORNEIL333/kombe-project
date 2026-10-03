import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/state/operation_result.dart';
import '../../core/widgets/kombe_logo.dart';
import '../../core/widgets/server_action_guard.dart';
import '../../domain/repositories/auth_repository.dart';
import '../../l10n/app_localizations.dart';
import 'auth_validators.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();
  final TextEditingController _phone = TextEditingController();

  @override
  void dispose() {
    _phone.dispose();
    super.dispose();
  }

  Future<void> _continue() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    final OperationResult<void> result =
        await context.read<AuthRepository>().registerPhone(
              '+237${_phone.text.replaceAll(RegExp(r'\s+'), '')}',
            );
    if (!mounted) return;
    switch (result) {
      case OperationSuccess<void>():
        context.go('/verify-phone');
      case OperationBlocked<void>():
        await showServerAuthorityRequired(context);
      case OperationFailure<void>(:final error):
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.toString())));
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: <Widget>[
            const Center(child: KombeLogo(size: 48)),
            const SizedBox(height: 36),
            Text(l10n.createAccount, style: Theme.of(context).textTheme.headlineLarge),
            const SizedBox(height: 10),
            Text(
              'Votre numéro doit être vérifié par le service KÓMBE avant la création du compte.',
              style: Theme.of(context).textTheme.bodyLarge,
            ),
            const SizedBox(height: 28),
            Form(
              key: _formKey,
              child: TextFormField(
                controller: _phone,
                keyboardType: TextInputType.phone,
                decoration: InputDecoration(
                  labelText: l10n.phone,
                  prefixText: '+237  ',
                ),
                validator: (String? value) =>
                    AuthValidators.isCameroonLocalPhone(value ?? '')
                        ? null
                        : l10n.invalidPhone,
              ),
            ),
            const SizedBox(height: 20),
            FilledButton(onPressed: _continue, child: Text(l10n.continueLabel)),
          ],
        ),
      ),
    );
  }
}
