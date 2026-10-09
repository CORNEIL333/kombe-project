import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/design/kombe_colors.dart';
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
                      const Center(child: KombeLogo(size: 60)),
                      const SizedBox(height: 36),
                      Text(
                        'Connexion',
                        style: Theme.of(context).textTheme.displaySmall?.copyWith(color: KombeColors.ink),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Retrouvez votre espace et continuez à faire grandir votre communauté.',
                        style: Theme.of(context).textTheme.bodyLarge?.copyWith(color: KombeColors.slate),
                      ),
                      const SizedBox(height: 28),
                      TextFormField(
                        controller: _email,
                        keyboardType: TextInputType.emailAddress,
                        autofillHints: const <String>[AutofillHints.email],
                        decoration: InputDecoration(
                          labelText: l10n.email,
                          prefixIcon: const Icon(Icons.mail_outline_rounded),
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
                            : Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: <Widget>[
                                  Text(l10n.sendCode),
                                  const SizedBox(width: 10),
                                  const Icon(Icons.arrow_forward_rounded),
                                ],
                              ),
                      ),
                      const SizedBox(height: 10),
                      Center(
                        child: TextButton(
                          onPressed: () => context.go('/recovery-request'),
                          child: Text(l10n.forgotCode),
                        ),
                      ),
                      const SizedBox(height: 18),
                      // Note exacte (pas de promesse de chiffrement non garantie).
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(color: KombeColors.mint, borderRadius: BorderRadius.circular(16)),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: <Widget>[
                            const Icon(Icons.verified_user_outlined, color: KombeColors.forest, size: 28),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: <Widget>[
                                  Text('Connexion sans mot de passe', style: Theme.of(context).textTheme.titleSmall?.copyWith(color: KombeColors.forest)),
                                  const SizedBox(height: 4),
                                  Text(
                                    'Un code à usage unique est envoyé à votre adresse email. Il n''est valable qu''une fois.',
                                    style: Theme.of(context).textTheme.bodySmall?.copyWith(color: KombeColors.ink),
                                  ),
                                ],
                              ),
                            ),
                          ],
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
