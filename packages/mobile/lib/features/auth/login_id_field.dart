import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../domain/repositories/auth_repository.dart';
import '../../l10n/app_localizations.dart';
import 'auth_validators.dart';

/// Champ d'identifiant de connexion, commun à la connexion, l'inscription et
/// la récupération. Il interroge les canaux ouverts du serveur : si le SMS
/// n'est pas ouvert, il demande d'emblée une adresse e-mail (clavier, libellé
/// et contrôle adaptés) — un numéro saisi échouait sinon au serveur.
class LoginIdField extends StatefulWidget {
  const LoginIdField({super.key, required this.controller, this.showIcon = false});

  final TextEditingController controller;
  final bool showIcon;

  @override
  State<LoginIdField> createState() => _LoginIdFieldState();
}

class _LoginIdFieldState extends State<LoginIdField> {
  bool _phoneOpen = true;

  @override
  void initState() {
    super.initState();
    context.read<AuthRepository>().phoneLoginOpen().then((bool open) {
      if (mounted && open != _phoneOpen) setState(() => _phoneOpen = open);
    });
  }

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    return TextFormField(
      controller: widget.controller,
      keyboardType: _phoneOpen ? TextInputType.text : TextInputType.emailAddress,
      autocorrect: false,
      textCapitalization: TextCapitalization.none,
      autofillHints: _phoneOpen
          ? const <String>[AutofillHints.telephoneNumber, AutofillHints.email]
          : const <String>[AutofillHints.email],
      decoration: InputDecoration(
        labelText: _phoneOpen ? l10n.email : l10n.emailOnly,
        prefixIcon: widget.showIcon
            ? Icon(_phoneOpen ? Icons.phone_android_rounded : Icons.alternate_email_rounded)
            : null,
      ),
      validator: (String? value) {
        final String v = value ?? '';
        if (_phoneOpen) return AuthValidators.isLogin(v) ? null : l10n.invalidEmail;
        return AuthValidators.isEmail(v) ? null : l10n.emailOnlyInvalid;
      },
    );
  }
}
