import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_failure.dart';
import '../../core/design/kombe_colors.dart';
import '../../core/state/operation_result.dart';
import '../../core/state/resource.dart';
import '../../core/widgets/operation_feedback.dart';
import '../../domain/entities/auth.dart';
import '../../domain/repositories/auth_repository.dart';
import 'auth_validators.dart';
import 'verify_code_screen.dart';

/// Formulaire commun « recevoir un code » (connexion, création de compte,
/// accès perdu) : il lit les voies réellement ouvertes sur le serveur
/// (`GET /v1/auth/channels`) et ne propose qu'elles. Le champ (libellé,
/// clavier) suit la voie choisie ; la voie est envoyée avec la demande.
class CodeRequestForm extends StatefulWidget {
  const CodeRequestForm({required this.purpose, required this.submitLabel, super.key});

  final VerifyCodePurpose purpose;
  final String submitLabel;

  @override
  State<CodeRequestForm> createState() => _CodeRequestFormState();
}

class _CodeRequestFormState extends State<CodeRequestForm> {
  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();
  final TextEditingController _login = TextEditingController();
  Resource<AuthChannels> _channels = const ResourceLoading<AuthChannels>();
  LoginChannel? _channel;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _loadChannels();
  }

  @override
  void dispose() {
    _login.dispose();
    super.dispose();
  }

  Future<void> _loadChannels() async {
    setState(() => _channels = const ResourceLoading<AuthChannels>());
    final Resource<AuthChannels> next = await context.read<AuthRepository>().loadChannels();
    if (!mounted) return;
    setState(() {
      _channels = next;
      if (next case ResourceReady<AuthChannels>(:final AuthChannels data)) {
        final List<LoginChannel> open = data.open;
        _channel = open.contains(_channel) ? _channel : (open.isEmpty ? null : open.first);
      }
    });
  }

  Future<void> _submit(LoginChannel channel) async {
    if (!(_formKey.currentState?.validate() ?? false) || _submitting) return;
    setState(() => _submitting = true);
    final String login = _login.text.trim();
    final OperationResult<void> result = await context.read<AuthRepository>().requestCode(login: login, channel: channel);
    if (!mounted) return;
    setState(() => _submitting = false);
    if (reportOutcome(context, result)) {
      context.go(VerifyCodeScreen.routeFor(purpose: widget.purpose, identityId: login, channel: channel));
    }
  }

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    return switch (_channels) {
      ResourceLoading<AuthChannels>() => const Padding(
          padding: EdgeInsets.symmetric(vertical: 24),
          child: Center(child: CircularProgressIndicator()),
        ),
      ResourceUnavailable<AuthChannels>() => _Problem(
          message: 'Cette version de l’application n’est reliée à aucun serveur KÓMBE. Installez la version officielle pour vous connecter.',
          onRetry: null,
        ),
      ResourceFailure<AuthChannels>(:final Object error) => _Problem(message: failureMessage(error), onRetry: _loadChannels),
      ResourceReady<AuthChannels>(:final AuthChannels data) when data.open.isEmpty || _channel == null => _Problem(
          message: 'La connexion est momentanément fermée sur le serveur KÓMBE. Réessayez un peu plus tard.',
          onRetry: _loadChannels,
        ),
      ResourceReady<AuthChannels>(:final AuthChannels data) => Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              if (data.open.length > 1) ...<Widget>[
                Text('Recevoir le code par', style: t.titleSmall),
                const SizedBox(height: 8),
                SegmentedButton<LoginChannel>(
                  showSelectedIcon: false,
                  segments: <ButtonSegment<LoginChannel>>[
                    for (final LoginChannel c in data.open) ButtonSegment<LoginChannel>(value: c, label: Text(c.label)),
                  ],
                  selected: <LoginChannel>{_channel!},
                  onSelectionChanged: _submitting
                      ? null
                      : (Set<LoginChannel> v) => setState(() {
                            _channel = v.first;
                            _login.clear();
                          }),
                ),
                const SizedBox(height: 16),
              ],
              TextFormField(
                key: ValueKey<LoginChannel>(_channel!),
                controller: _login,
                keyboardType: _channel!.isPhone ? TextInputType.phone : TextInputType.emailAddress,
                autocorrect: false,
                textInputAction: TextInputAction.send,
                onFieldSubmitted: (_) => _submit(_channel!),
                autofillHints: <String>[_channel!.isPhone ? AutofillHints.telephoneNumber : AutofillHints.email],
                decoration: InputDecoration(
                  labelText: _channel!.fieldLabel,
                  hintText: _channel!.isPhone ? '6 77 12 34 56' : 'nom@exemple.com',
                  prefixIcon: Icon(_channel!.isPhone ? Icons.phone_android_rounded : Icons.alternate_email_rounded),
                ),
                validator: (String? value) => AuthValidators.isLoginFor(_channel!, value ?? '')
                    ? null
                    : _channel!.isPhone
                        ? 'Saisissez un numéro camerounais (ex. 6 77 12 34 56)'
                        : 'Saisissez une adresse e-mail valide',
              ),
              const SizedBox(height: 8),
              Text(
                'Un code à 6 chiffres vous est envoyé ${_channel!.viaLabel}. Aucun mot de passe.',
                style: t.bodySmall?.copyWith(color: KombeColors.slate),
              ),
              const SizedBox(height: 20),
              FilledButton(
                onPressed: _submitting ? null : () => _submit(_channel!),
                child: _submitting
                    ? const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2))
                    : Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: <Widget>[
                          Text(widget.submitLabel),
                          const SizedBox(width: 10),
                          const Icon(Icons.arrow_forward_rounded),
                        ],
                      ),
              ),
            ],
          ),
        ),
    };
  }
}

class _Problem extends StatelessWidget {
  const _Problem({required this.message, required this.onRetry});
  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: KombeColors.sand, borderRadius: BorderRadius.circular(16)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                const Icon(Icons.cloud_off_outlined, color: KombeColors.goldDark),
                const SizedBox(width: 12),
                Expanded(child: Text(message, style: Theme.of(context).textTheme.bodyMedium)),
              ],
            ),
            if (onRetry != null) ...<Widget>[
              const SizedBox(height: 10),
              Align(
                alignment: Alignment.centerRight,
                child: OutlinedButton(onPressed: onRetry, child: const Text('Réessayer')),
              ),
            ],
          ],
        ),
      );
}
