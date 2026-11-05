import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/widgets/kombe_components.dart';
import '../../core/design/kombe_theme.dart';
import '../../core/design/kombe_spacing.dart';
import '../../core/design/kombe_colors.dart';
import '../../core/api/api_failure.dart';
import '../../core/state/operation_result.dart';
import '../../core/widgets/server_action_guard.dart';
import '../../domain/entities/group.dart';
import '../../domain/repositories/group_repository.dart';

/// Écran de CRÉATION d'une tontine, branché sur l'API réelle
/// `POST /v1/tontines`. Le bureau saisit les VRAIS paramètres d'admin :
/// nom, cotisation par part et par séance, rythme, date de première séance,
/// heure limite, plafond de membres. Rien n'est décidé à sa place : le
/// montant et la fréquence ne sont jamais pré-remplis, et l'ordre de tour
/// (tirage au sort vérifiable, ordre d'arrivée, décidé par le bureau) se
/// choisit à chaque saison, au démarrage du cycle — pas ici.
class CreateGroupScreen extends StatefulWidget {
  const CreateGroupScreen({super.key});

  @override
  State<CreateGroupScreen> createState() => _CreateGroupScreenState();
}

class _CreateGroupScreenState extends State<CreateGroupScreen> {
  final GlobalKey<FormState> _form = GlobalKey<FormState>();
  final TextEditingController _name = TextEditingController();
  final TextEditingController _contribution = TextEditingController();
  final TextEditingController _maxMembers = TextEditingController();
  final TextEditingController _place = TextEditingController();
  CadenceKind _cadence = CadenceKind.weekly;
  int _weekday = 1; // lundi (0 = dimanche, convention serveur)
  int _nth = 1;
  DateTime? _firstDate;
  TimeOfDay _deadline = const TimeOfDay(hour: 18, minute: 0);
  bool _busy = false;

  static const List<String> _jours = <String>[
    'Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi',
  ];

  @override
  void dispose() {
    _name.dispose();
    _contribution.dispose();
    _maxMembers.dispose();
    _place.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_form.currentState?.validate() ?? false) || _busy) return;
    setState(() => _busy = true);
    final int? nDays = int.tryParse(_maxMembers.text.trim());
    final OperationResult<String> result =
        await context.read<GroupRepository>().createGroup(TontineCreation(
              name: _name.text.trim(),
              contributionPerShare: _contribution.text.trim(),
              cadenceKind: _cadence,
              weekday: switch (_cadence) {
                CadenceKind.weekly || CadenceKind.biweekly ||
                CadenceKind.monthlyNthWeekday => _weekday,
                _ => null,
              },
              dayOfMonth: _cadence == CadenceKind.monthlyDay ? _weekday : null,
              nth: _cadence == CadenceKind.monthlyNthWeekday ? _nth : null,
              firstMeetingDate: _yyyyMmDd(_firstDate ?? DateTime.now()),
              deadlineTime:
                  '${_deadline.hour.toString().padLeft(2, '0')}:${_deadline.minute.toString().padLeft(2, '0')}',
              maxMembers: nDays ?? 0,
              meetingPlace: _place.text.trim().isEmpty ? null : _place.text.trim(),
            ));
    if (!mounted) return;
    setState(() => _busy = false);
    switch (result) {
      case OperationSuccess<String>():
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Tontine créée. Vous pouvez y inviter ses membres.')),
        );
      case OperationBlocked<String>():
        await showServerAuthorityRequired(context);
      case OperationFailure<String>(:final error):
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Création refusée : ${_explain(error)}')),
        );
    }
  }

  /// Motif lisible : la raison française du serveur prime (message `Error`
  /// de l'API réelle) ; sinon code client connu ; sinon repli générique.
  static String _explain(Object error) {
    if (error is ApiFailure && (error.message?.isNotEmpty ?? false)) {
      return error.message!;
    }
    final String s = error.toString();
    if (s.contains('UNAUTHENTICATED') || s.contains('401')) return 'session requise (reconnectez-vous).';
    return 'la création n’a pas abouti. Vérifiez les informations, puis réessayez.';
  }

  static String _yyyyMmDd(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    final String locale = Localizations.localeOf(context).toLanguageTag();
    return Scaffold(
      appBar: AppBar(title: const Text('Créer une tontine')),
      body: SafeArea(
        child: Form(
          key: _form,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
            children: <Widget>[
              _Block(
                icon: Icons.diversity_3_rounded,
                title: 'Le groupe',
                children: <Widget>[
                  _Field(
                    label: 'Nom de la tontine',
                    child: TextFormField(
                      controller: _name,
                      textCapitalization: TextCapitalization.sentences,
                      textInputAction: TextInputAction.next,
                      decoration: const InputDecoration(hintText: 'Ex. Tontine des artisans'),
                      validator: (String? v) => (v == null || v.trim().isEmpty) ? 'Le nom est requis.' : null,
                    ),
                  ),
                  _Field(
                    label: 'Nombre maximum de membres',
                    child: TextFormField(
                      controller: _maxMembers,
                      keyboardType: TextInputType.number,
                      inputFormatters: <TextInputFormatter>[FilteringTextInputFormatter.digitsOnly],
                      decoration: const InputDecoration(hintText: 'Entre 2 et 60'),
                      validator: (String? v) {
                        final int n = int.tryParse((v ?? '').trim()) ?? 0;
                        return (n >= 2 && n <= 60) ? null : 'Entre 2 et 60 membres.';
                      },
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              _Block(
                icon: Icons.payments_outlined,
                tone: KombeTone.money,
                title: 'La cotisation',
                children: <Widget>[
                  _Field(
                    label: 'Par part et par séance',
                    help: 'Chaque part verse ce montant à chaque séance. Un membre peut prendre de 1 à 5 parts.',
                    child: TextFormField(
                      controller: _contribution,
                      keyboardType: TextInputType.number,
                      inputFormatters: <TextInputFormatter>[FilteringTextInputFormatter.digitsOnly],
                      style: KombeType.amount(size: 22),
                      decoration: const InputDecoration(hintText: 'Ex. 5000', suffixText: 'FCFA'),
                      validator: (String? v) {
                        final int n = int.tryParse((v ?? '').trim()) ?? 0;
                        return n > 0 ? null : 'Montant entier requis, supérieur à 0.';
                      },
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              _Block(
                icon: Icons.event_outlined,
                tone: KombeTone.info,
                title: 'Les séances',
                children: <Widget>[
                  _Field(
                    label: 'Rythme',
                    child: DropdownButtonFormField<CadenceKind>(
                      initialValue: _cadence,
                      isExpanded: true,
                      borderRadius: BorderRadius.circular(KombeSpacing.fieldRadius),
                      dropdownColor: Colors.white,
                      items: <DropdownMenuItem<CadenceKind>>[
                        for (final CadenceKind k in CadenceKind.values) DropdownMenuItem<CadenceKind>(value: k, child: Text(cadenceKindLabel(k))),
                      ],
                      onChanged: (CadenceKind? v) => setState(() => _cadence = v ?? _cadence),
                    ),
                  ),
                  if (_cadence == CadenceKind.weekly || _cadence == CadenceKind.biweekly || _cadence == CadenceKind.monthlyNthWeekday)
                    _Field(
                      label: 'Jour de séance',
                      child: DropdownButtonFormField<int>(
                        initialValue: _weekday,
                        isExpanded: true,
                        borderRadius: BorderRadius.circular(KombeSpacing.fieldRadius),
                        dropdownColor: Colors.white,
                        items: <DropdownMenuItem<int>>[
                          for (var j = 1; j <= 6; j++) DropdownMenuItem<int>(value: j, child: Text(_jours[j])),
                          const DropdownMenuItem<int>(value: 0, child: Text('Dimanche')),
                        ],
                        onChanged: (int? v) => setState(() => _weekday = v ?? _weekday),
                      ),
                    ),
                  if (_cadence == CadenceKind.monthlyDay)
                    _Field(
                      label: 'Quantième du mois (jour)',
                      child: DropdownButtonFormField<int>(
                        initialValue: _weekday,
                        isExpanded: true,
                        borderRadius: BorderRadius.circular(KombeSpacing.fieldRadius),
                        dropdownColor: Colors.white,
                        items: <DropdownMenuItem<int>>[
                          for (var d = 1; d <= 31; d++) DropdownMenuItem<int>(value: d, child: Text('$d')),
                        ],
                        onChanged: (int? v) => setState(() => _weekday = v ?? _weekday),
                      ),
                    ),
                  if (_cadence == CadenceKind.monthlyNthWeekday)
                    _Field(
                      label: 'Position dans le mois',
                      child: DropdownButtonFormField<int>(
                        initialValue: _nth,
                        isExpanded: true,
                        borderRadius: BorderRadius.circular(KombeSpacing.fieldRadius),
                        dropdownColor: Colors.white,
                        items: const <DropdownMenuItem<int>>[
                          DropdownMenuItem<int>(value: 1, child: Text('1er')),
                          DropdownMenuItem<int>(value: 2, child: Text('2e')),
                          DropdownMenuItem<int>(value: 3, child: Text('3e')),
                          DropdownMenuItem<int>(value: 4, child: Text('4e')),
                          DropdownMenuItem<int>(value: -1, child: Text('Dernier')),
                        ],
                        onChanged: (int? v) => setState(() => _nth = v ?? _nth),
                      ),
                    ),
                  _Field(
                    label: 'Date de la première séance',
                    child: _PickerField(
                      icon: Icons.calendar_today_outlined,
                      text: _firstDate == null ? 'Choisir une date' : DateFormat.yMMMMd(locale).format(_firstDate!),
                      onTap: () async {
                        final DateTime? picked = await showDatePicker(
                          context: context,
                          initialDate: _firstDate ?? DateTime.now(),
                          firstDate: DateTime.now().subtract(const Duration(days: 31)),
                          lastDate: DateTime.now().add(const Duration(days: 366 * 3)),
                        );
                        if (picked != null) setState(() => _firstDate = picked);
                      },
                    ),
                  ),
                  _Field(
                    label: 'Heure limite de présence',
                    child: _PickerField(
                      icon: Icons.access_time_rounded,
                      text: _deadline.format(context),
                      onTap: () async {
                        final TimeOfDay? picked = await showTimePicker(context: context, initialTime: _deadline);
                        if (picked != null) setState(() => _deadline = picked);
                      },
                    ),
                  ),
                  _Field(
                    label: 'Lieu de séance (facultatif)',
                    child: TextFormField(
                      controller: _place,
                      textCapitalization: TextCapitalization.sentences,
                      maxLength: 120,
                      decoration: const InputDecoration(hintText: 'Ex. Boutique de M. Jean', counterText: ''),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(color: KombeTone.brand.bg, borderRadius: BorderRadius.circular(KombeSpacing.tileRadius)),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    const Icon(Icons.info_outline_rounded, color: KombeColors.forest, size: 20),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'L\'ordre de passage se choisit à chaque saison, au démarrage du cycle : tirage au sort vérifiable, ordre d\'arrivée, ou décidé par le bureau. Amendes, caisse de secours et autres règles restent modifiables dans le règlement avant le premier cycle.',
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(color: KombeColors.forest),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 22),
              FilledButton(
                onPressed: _busy ? null : _submit,
                child: _busy
                    ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Text('Créer la tontine'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Bloc de formulaire : carte blanche, picto et titre, champs espacés.
class _Block extends StatelessWidget {
  const _Block({required this.icon, required this.title, required this.children, this.tone = KombeTone.brand});
  final IconData icon;
  final String title;
  final List<Widget> children;
  final KombeTone tone;

  @override
  Widget build(BuildContext context) => KombeCard(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Row(
              children: <Widget>[
                KombeIconBadge(icon, tone: tone, size: 36),
                const SizedBox(width: 12),
                Semantics(header: true, child: Text(title, style: Theme.of(context).textTheme.titleLarge)),
              ],
            ),
            const SizedBox(height: 14),
            ...children,
          ],
        ),
      );
}

class _Field extends StatelessWidget {
  const _Field({required this.label, required this.child, this.help});
  final String label;
  final String? help;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Text(label, style: t.titleSmall),
          if (help != null) ...<Widget>[const SizedBox(height: 2), Text(help!, style: t.bodySmall)],
          const SizedBox(height: 6),
          child,
        ],
      ),
    );
  }
}

/// Champ qui ouvre un sélecteur (date, heure).
class _PickerField extends StatelessWidget {
  const _PickerField({required this.icon, required this.text, required this.onTap});
  final IconData icon;
  final String text;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => InkWell(
        borderRadius: BorderRadius.circular(KombeSpacing.fieldRadius),
        onTap: onTap,
        child: InputDecorator(
          decoration: const InputDecoration(),
          child: Row(
            children: <Widget>[
              Icon(icon, size: 18, color: KombeColors.slate),
              const SizedBox(width: 10),
              Expanded(child: Text(text, style: Theme.of(context).textTheme.bodyLarge)),
            ],
          ),
        ),
      );
}
