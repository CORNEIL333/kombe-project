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

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();
  final TextEditingController _phone = TextEditingController();
  final TextEditingController _pin = TextEditingController();
  bool _obscurePin = true;
  bool _submitting = false;

  @override
  void dispose() {
    _phone.dispose();
    _pin.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() => _submitting = true);
    final OperationResult<dynamic> result =
        await context.read<AuthRepository>().signIn(
              phoneE164: '+237${_phone.text.replaceAll(RegExp(r'\s+'), '')}',
              pin: _pin.text,
            );
    if (!mounted) return;
    setState(() => _submitting = false);
    switch (result) {
      case OperationSuccess<dynamic>():
        context.go('/app');
      case OperationBlocked<dynamic>():
        await showServerAuthorityRequired(context);
      case OperationFailure<dynamic>(:final error):
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(error.toString())),
        );
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
                      Text('Connexion', style: Theme.of(context).textTheme.headlineLarge),
                      const SizedBox(height: 8),
                      Text(
                        'Retrouvez votre espace et continuez à faire grandir votre communauté.',
                        style: Theme.of(context).textTheme.bodyLarge,
                      ),
                      const SizedBox(height: 28),
                      TextFormField(
                        controller: _phone,
                        keyboardType: TextInputType.phone,
                        autofillHints: const <String>[AutofillHints.telephoneNumber],
                        decoration: InputDecoration(
                          labelText: l10n.phone,
                          prefixText: '+237  ',
                          prefixIcon: const Icon(Icons.phone_android),
                        ),
                        validator: (String? value) =>
                            AuthValidators.isCameroonLocalPhone(value ?? '')
                                ? null
                                : l10n.invalidPhone,
                      ),
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: _pin,
                        obscureText: _obscurePin,
                        keyboardType: TextInputType.number,
                        maxLength: 4,
                        autofillHints: const <String>[AutofillHints.password],
                        decoration: InputDecoration(
                          labelText: l10n.pin,
                          counterText: '',
                          prefixIcon: const Icon(Icons.lock_outline),
                          suffixIcon: IconButton(
                            tooltip: _obscurePin ? 'Afficher' : 'Masquer',
                            onPressed: () => setState(() => _obscurePin = !_obscurePin),
                            icon: Icon(_obscurePin ? Icons.visibility_off : Icons.visibility),
                          ),
                        ),
                        validator: (String? value) =>
                            AuthValidators.isPin(value ?? '') ? null : l10n.invalidPin,
                      ),
                      const SizedBox(height: 20),
                      FilledButton(
                        onPressed: _submitting ? null : _submit,
                        child: _submitting
                            ? const SizedBox.square(
                                dimension: 20,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              )
                            : Text(l10n.signIn),
                      ),
                      const SizedBox(height: 10),
                      Center(
                        child: TextButton(
                          onPressed: () => context.go('/recover-pin'),
                          child: Text(l10n.forgotPin),
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
