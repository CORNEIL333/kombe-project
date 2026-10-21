import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/state/operation_result.dart';
import '../../core/widgets/operation_feedback.dart';
import '../../domain/entities/auth.dart';
import '../../domain/repositories/auth_repository.dart';
import '../../l10n/app_localizations.dart';
import 'auth_validators.dart';

/// Les TROIS entrées (créer un compte, se connecter, accès perdu) aboutissent
/// au même geste serveur : un code vérifié OUVRE la session. Un seul écran de
/// saisie, dont seuls les textes changent selon l'entrée.
enum VerifyCodePurpose { registration, login, recovery }

/// Délai avant de pouvoir redemander un code (aligné sur le serveur, 45 s).
const Duration resendCooldown = Duration(seconds: 45);

class VerifyCodeScreen extends StatefulWidget {
  const VerifyCodeScreen({
    super.key,
    required this.purpose,
    required this.identityId,
    this.channel = LoginChannel.email,
  });

  final VerifyCodePurpose purpose;

  /// Adresse e-mail ou numéro saisi.
  final String identityId;
  final LoginChannel channel;

  /// URL de route ; l'identifiant est encodé via `Uri`.
  static String routeFor({
    required VerifyCodePurpose purpose,
    required String identityId,
    LoginChannel channel = LoginChannel.email,
  }) =>
      Uri(
        path: '/verify-code',
        queryParameters: <String, String>{
          'purpose': purpose.name,
          'identityId': identityId,
          'channel': channel.apiName,
        },
      ).toString();

  @override
  State<VerifyCodeScreen> createState() => _VerifyCodeScreenState();
}

class _VerifyCodeScreenState extends State<VerifyCodeScreen> {
  final TextEditingController _code = TextEditingController();
  Timer? _timer;
  int _wait = resendCooldown.inSeconds;
  bool _submitting = false;
  bool _resending = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _startCountdown();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _code.dispose();
    super.dispose();
  }

  void _startCountdown() {
    _timer?.cancel();
    setState(() => _wait = resendCooldown.inSeconds);
    _timer = Timer.periodic(const Duration(seconds: 1), (Timer t) {
      if (!mounted) {
        t.cancel();
        return;
      }
      setState(() => _wait = _wait > 0 ? _wait - 1 : 0);
      if (_wait == 0) t.cancel();
    });
  }

  Future<void> _resend() async {
    setState(() => _resending = true);
    final OperationResult<void> r =
        await context.read<AuthRepository>().requestCode(login: widget.identityId, channel: widget.channel);
    if (!mounted) return;
    setState(() => _resending = false);
    if (reportOutcome(context, r)) {
      showKombeMessage(context, 'Nouveau code envoyé ${widget.channel.viaLabel}.');
      _startCountdown();
    }
  }

  Future<void> _verify() async {
    if (_submitting) return;
    if (!AuthValidators.isChallengeCode(_code.text)) {
      setState(() => _error = 'Le code comporte 6 chiffres.');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    final OperationResult<AuthSession> result =
        await context.read<AuthRepository>().verifyCode(login: widget.identityId, code: _code.text.trim());
    if (!mounted) return;
    setState(() => _submitting = false);
    final String? problem = outcomeMessage(result);
    if (problem != null) {
      setState(() => _error = problem);
      return;
    }
    // La session est ouverte par le serveur : on entre dans l'application
    // (le routeur demande d'abord le nom si le compte n'en a pas encore).
    if (widget.purpose == VerifyCodePurpose.registration) {
      showKombeMessage(context, AppLocalizations.of(context).accountActivated);
    } else if (widget.purpose == VerifyCodePurpose.recovery) {
      showKombeMessage(context, AppLocalizations.of(context).recoveryComplete);
    }
    context.go('/app');
  }

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final TextTheme t = Theme.of(context).textTheme;
    final String back = widget.purpose == VerifyCodePurpose.registration
        ? '/register'
        : widget.purpose == VerifyCodePurpose.recovery
            ? '/recovery-request'
            : '/login';
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.verifyCodeTitle),
        leading: BackButton(onPressed: () => context.go(back)),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: <Widget>[
            Text(
              widget.purpose == VerifyCodePurpose.registration ? 'Dernière étape' : l10n.verifyCodeTitle,
              style: t.headlineLarge,
            ),
            const SizedBox(height: 10),
            Text(
              'Saisissez le code à 6 chiffres envoyé ${widget.channel.viaLabel} à ${widget.identityId}.',
              style: t.bodyLarge,
            ),
            if (widget.purpose == VerifyCodePurpose.registration) ...<Widget>[
              const SizedBox(height: 6),
              Text('Ce premier code crée votre compte.', style: t.bodyMedium?.copyWith(color: KombeColors.slate)),
            ],
            const SizedBox(height: 26),
            TextField(
              controller: _code,
              autofocus: true,
              keyboardType: TextInputType.number,
              maxLength: 6,
              inputFormatters: <TextInputFormatter>[FilteringTextInputFormatter.digitsOnly],
              autofillHints: const <String>[AutofillHints.oneTimeCode],
              textInputAction: TextInputAction.done,
              onChanged: (String v) {
                if (_error != null) setState(() => _error = null);
                if (v.length == 6) _verify();
              },
              onSubmitted: (_) => _verify(),
              style: t.headlineSmall?.copyWith(letterSpacing: 8),
              decoration: InputDecoration(labelText: 'Code à 6 chiffres', errorText: _error, errorMaxLines: 4),
            ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: _submitting ? null : _verify,
              child: _submitting
                  ? const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Text('Valider le code'),
            ),
            const SizedBox(height: 16),
            Center(
              child: TextButton.icon(
                onPressed: _wait > 0 || _resending ? null : _resend,
                icon: const Icon(Icons.refresh_rounded),
                label: Text(_wait > 0 ? 'Renvoyer le code (dans $_wait s)' : 'Renvoyer le code'),
              ),
            ),
            Center(
              child: TextButton(
                onPressed: () => context.go(back),
                child: Text(widget.channel.isPhone ? 'Changer de numéro' : 'Changer d’adresse e-mail'),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Le code expire au bout de 10 minutes. Pensez à regarder vos courriers indésirables.',
              textAlign: TextAlign.center,
              style: t.bodySmall?.copyWith(color: KombeColors.slate),
            ),
          ],
        ),
      ),
    );
  }
}
