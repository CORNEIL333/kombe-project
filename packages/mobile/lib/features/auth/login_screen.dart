import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/state/operation_result.dart';
import '../../core/widgets/african_pattern_band.dart';
import '../../core/widgets/kombe_logo.dart';
import '../../core/widgets/server_action_guard.dart';
import '../../domain/repositories/auth_repository.dart';
import '../../l10n/app_localizations.dart';
import 'auth_validators.dart';
import 'verify_code_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();
  final TextEditingController _email = TextEditingController();
  bool _submitting = false;

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() => _submitting = true);
    final OperationResult<void> result = await context
        .read<AuthRepository>()
        .requestLogin(_email.text.trim());
    if (!mounted) return;
    setState(() => _submitting = false);
    switch (result) {
      case OperationSuccess<void>():
        context.go(
          VerifyCodeScreen.routeFor(
            purpose: VerifyCodePurpose.login,
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
      body: SafeArea(
        child: Column(
          children: <Widget>[
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(24, 20, 24, 16),
                child: Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      IconButton(
                        tooltip: l10n.back,
                        onPressed: () => context.go('/'),
                        icon: const Icon(Icons.arrow_back_ios_new),
                      ),
                      const SizedBox(height: 18),
                      const Center(child: KombeLogo(size: 52)),
                      const SizedBox(height: 50),
                      Text(
                        'Connexion',
                        style: Theme.of(context).textTheme.headlineLarge,
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Retrouvez votre espace et continuez à faire grandir votre communauté.',
                        style: Theme.of(context).textTheme.bodyLarge,
                      ),
                      const SizedBox(height: 28),
                      TextFormField(
                        controller: _email,
                        keyboardType: TextInputType.emailAddress,
                        autofillHints: const <String>[AutofillHints.email],
                        decoration: InputDecoration(
                          labelText: l10n.email,
                          prefixIcon: const Icon(Icons.alternate_email),
                        ),
                        validator: (String? value) =>
                            AuthValidators.isEmail(value ?? '')
                            ? null
                            : l10n.invalidEmail,
                      ),
                      const SizedBox(height: 20),
                      FilledButton(
                        onPressed: _submitting ? null : _submit,
                        child: _submitting
                            ? const SizedBox.square(
                                dimension: 20,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              )
                            : Text(l10n.sendCode),
                      ),
                      const SizedBox(height: 10),
                      Center(
                        child: TextButton(
                          onPressed: () => context.go('/recovery-request'),
                          child: Text(l10n.forgotCode),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            const AfricanPatternBand(height: 42),
          ],
        ),
      ),
    );
  }
}
