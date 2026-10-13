import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/state/operation_result.dart';
import '../../core/widgets/kombe_logo.dart';
import '../../core/widgets/server_action_guard.dart';
import '../../domain/repositories/auth_repository.dart';
import '../../l10n/app_localizations.dart';
import 'auth_validators.dart';
import 'verify_code_screen.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();
  final TextEditingController _email = TextEditingController();
  bool _submitting = false;

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  Future<void> _continue() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() => _submitting = true);
    final OperationResult<void> result = await context
        .read<AuthRepository>()
        .requestRegistration(_email.text.trim());
    if (!mounted) return;
    setState(() => _submitting = false);
    switch (result) {
      case OperationSuccess<void>():
        context.go(
          VerifyCodeScreen.routeFor(
            purpose: VerifyCodePurpose.registration,
            identityId: _email.text.trim(),
          ),
        );
      case OperationBlocked<void>():
        await showServerAuthorityRequired(context);
      case OperationFailure<void>(:final error):
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(error.toString())));
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
            Text(
              l10n.createAccount,
              style: Theme.of(context).textTheme.headlineLarge,
            ),
            const SizedBox(height: 10),
            Text(
              l10n.registerIntro,
              style: Theme.of(context).textTheme.bodyLarge,
            ),
            const SizedBox(height: 28),
            Form(
              key: _formKey,
              child: TextFormField(
                controller: _email,
                keyboardType: TextInputType.text,
                autofillHints: const <String>[AutofillHints.telephoneNumber, AutofillHints.email],
                decoration: InputDecoration(labelText: l10n.email),
                validator: (String? value) =>
                    AuthValidators.isLogin(value ?? '')
                    ? null
                    : l10n.invalidEmail,
              ),
            ),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: _submitting ? null : _continue,
              child: _submitting
                  ? const SizedBox.square(
                      dimension: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Text(l10n.continueLabel),
            ),
          ],
        ),
      ),
    );
  }
}
