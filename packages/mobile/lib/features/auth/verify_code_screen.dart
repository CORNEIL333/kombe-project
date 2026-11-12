import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/design/kombe_theme.dart';
import '../../core/formatters/labels.dart';
import '../../core/state/operation_result.dart';
import '../../core/widgets/kombe_components.dart';
import '../../core/widgets/operation_feedback.dart';
import '../../domain/entities/auth.dart';
import '../../domain/repositories/auth_repository.dart';
import '../../l10n/app_localizations.dart';

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

  /// Chiffres seuls : un code collé depuis l'e-mail arrive souvent avec des
  /// espaces (« 123 456 ») ou un retour à la ligne.
  String get _digits => _code.text.replaceAll(RegExp(r'\D'), '');

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
      showKombeMessage(context, AppLocalizations.of(context).vcNouveauCodeEnvoye(widget.channel.viaLabel));
      _startCountdown();
    }
  }

  Future<void> _verify() async {
    if (_submitting) return;
    final String code = _digits;
    if (code.length != 6) {
      setState(() => _error = AppLocalizations.of(context).vcLeCodeComporteChiffres);
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    final OperationResult<AuthSession> result =
        await context.read<AuthRepository>().verifyCode(login: widget.identityId, code: code);
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
      appBar: AppBar(leading: BackButton(onPressed: () => context.go(back))),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: <Widget>[
            KombeFormHeader(
              icon: Icons.sms_outlined,
              title: widget.purpose == VerifyCodePurpose.registration ? AppLocalizations.of(context).vcDerniereEtape : l10n.verifyCodeTitle,
              body: AppLocalizations.of(context).vcSaisissezLeCodeChiffresEnvoye(widget.channel.viaLabel, widget.identityId),
            ),
            if (widget.purpose == VerifyCodePurpose.registration)
              Padding(
                padding: const EdgeInsets.only(bottom: 18),
                child: Text(AppLocalizations.of(context).vcCePremierCodeCreeVotre, style: t.bodyMedium?.copyWith(color: KombeColors.slate)),
              ),
            TextField(
              controller: _code,
              autofocus: true,
              keyboardType: TextInputType.number,
              maxLength: 6,
              inputFormatters: <TextInputFormatter>[FilteringTextInputFormatter.digitsOnly],
              autofillHints: const <String>[AutofillHints.oneTimeCode],
              textInputAction: TextInputAction.done,
              textAlign: TextAlign.center,
              onChanged: (_) {
                if (_error != null) setState(() => _error = null);
                // Six chiffres saisis ou collés : vérification immédiate.
                if (_digits.length == 6) _verify();
              },
              onSubmitted: (_) => _verify(),
              style: KombeType.amount(size: 30).copyWith(letterSpacing: 8),
              decoration: InputDecoration(labelText: AppLocalizations.of(context).code, errorText: _error, errorMaxLines: 4),
            ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: _submitting ? null : _verify,
              child: _submitting
                  ? const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2))
                  : Text(AppLocalizations.of(context).vcValiderLeCode),
            ),
            const SizedBox(height: 16),
            Center(
              child: TextButton.icon(
                onPressed: _wait > 0 || _resending ? null : _resend,
                icon: const Icon(Icons.refresh_rounded),
                label: Text(_wait > 0 ? AppLocalizations.of(context).vcRenvoyerLeCodeDans(_wait) : AppLocalizations.of(context).vcRenvoyerLeCode),
              ),
            ),
            Center(
              child: TextButton(
                onPressed: () => context.go(back),
                child: Text(widget.channel.isPhone ? AppLocalizations.of(context).vcChangerDeNumero : AppLocalizations.of(context).vcChangerDadresseMail),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              AppLocalizations.of(context).vcLeCodeExpireAuBout,
              textAlign: TextAlign.center,
              style: t.bodySmall?.copyWith(color: KombeColors.slate),
            ),
          ],
        ),
      ),
    );
  }
}
