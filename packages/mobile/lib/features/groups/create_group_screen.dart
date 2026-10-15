import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

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
    return 'la demande a été refusée par le serveur.';
  }

  static String _yyyyMmDd(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Créer une tontine')),
      body: SafeArea(
        child: Form(
          key: _form,
          child: ListView(
            padding: const EdgeInsets.all(24),
            children: <Widget>[
              Text('Nom de la tontine', style: t.titleMedium),
              const SizedBox(height: 6),
              TextFormField(
                controller: _name,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(hintText: 'Ex. Tontine des artisans'),
                validator: (String? v) =>
                    (v == null || v.trim().isEmpty) ? 'Le nom est requis.' : null,
              ),
              const SizedBox(height: 22),
              Text('Cotisation par part et par séance (FCFA)', style: t.titleMedium),
              const SizedBox(height: 6),
              Text(
                'Choix de l\'administrateur : chaque part verse ce montant à chaque séance. Un membre peut prendre de 1 à 5 parts (cotisations multiples).',
                style: t.bodySmall,
              ),
              const SizedBox(height: 10),
              TextFormField(
                controller: _contribution,
                keyboardType: TextInputType.number,
                inputFormatters: <TextInputFormatter>[
                  FilteringTextInputFormatter.digitsOnly,
                ],
                decoration: const InputDecoration(hintText: 'Ex. 5 000'),
                validator: (String? v) {
                  final int n = int.tryParse((v ?? '').trim()) ?? 0;
                  return n > 0 ? null : 'Montant entier requis, supérieur à 0.';
                },
              ),
              const SizedBox(height: 22),
              Text('Rythme des séances', style: t.titleMedium),
              const SizedBox(height: 6),
              DropdownButtonFormField<CadenceKind>(
                initialValue: _cadence,
                items: <DropdownMenuItem<CadenceKind>>[
                  for (final CadenceKind k in CadenceKind.values)
                    DropdownMenuItem<CadenceKind>(value: k, child: Text(cadenceKindLabel(k))),
                ],
                onChanged: (CadenceKind? v) =>
                    setState(() => _cadence = v ?? _cadence),
              ),
              if (_cadence == CadenceKind.weekly ||
                  _cadence == CadenceKind.biweekly ||
                  _cadence == CadenceKind.monthlyNthWeekday) ...<Widget>[
                const SizedBox(height: 10),
                DropdownButtonFormField<int>(
                  initialValue: _weekday,
                  decoration: const InputDecoration(labelText: 'Jour de séance'),
                  items: <DropdownMenuItem<int>>[
                    for (var j = 1; j <= 6; j++)
                      DropdownMenuItem<int>(value: j, child: Text(_jours[j])),
                    const DropdownMenuItem<int>(value: 0, child: Text('Dimanche')),
                  ],
                  onChanged: (int? v) => setState(() => _weekday = v ?? _weekday),
                ),
              ],
              if (_cadence == CadenceKind.monthlyDay) ...<Widget>[
                const SizedBox(height: 10),
                DropdownButtonFormField<int>(
                  initialValue: _weekday,
                  decoration: const InputDecoration(labelText: 'Quantième du mois (jour)'),
                  items: <DropdownMenuItem<int>>[
                    for (var d = 1; d <= 31; d++)
                      DropdownMenuItem<int>(value: d, child: Text('$d')),
                  ],
                  onChanged: (int? v) => setState(() => _weekday = v ?? _weekday),
                ),
              ],
              if (_cadence == CadenceKind.monthlyNthWeekday) ...<Widget>[
                const SizedBox(height: 10),
                DropdownButtonFormField<int>(
                  initialValue: _nth,
                  decoration: const InputDecoration(labelText: 'Position dans le mois'),
                  items: const <DropdownMenuItem<int>>[
                    DropdownMenuItem<int>(value: 1, child: Text('1er')),
                    DropdownMenuItem<int>(value: 2, child: Text('2e')),
                    DropdownMenuItem<int>(value: 3, child: Text('3e')),
                    DropdownMenuItem<int>(value: 4, child: Text('4e')),
                    DropdownMenuItem<int>(value: -1, child: Text('Dernier')),
                  ],
                  onChanged: (int? v) => setState(() => _nth = v ?? _nth),
                ),
              ],
              const SizedBox(height: 22),
              Text('Date de la première séance', style: t.titleMedium),
              const SizedBox(height: 6),
              InkWell(
                onTap: () async {
                  final DateTime? picked = await showDatePicker(
                    context: context,
                    initialDate: _firstDate ?? DateTime.now(),
                    firstDate: DateTime.now().subtract(const Duration(days: 31)),
                    lastDate: DateTime.now().add(const Duration(days: 366 * 3)),
                  );
                  if (picked != null) setState(() => _firstDate = picked);
                },
                child: InputDecorator(
                  decoration: const InputDecoration(),
                  child: Row(
                    children: <Widget>[
                      const Icon(Icons.calendar_today_outlined, size: 18),
                      const SizedBox(width: 10),
                      Text(_firstDate == null
                          ? 'Choisir une date'
                          : _yyyyMmDd(_firstDate!)),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 22),
              Text('Heure limite de présence', style: t.titleMedium),
              const SizedBox(height: 6),
              InkWell(
                onTap: () async {
                  final TimeOfDay? picked = await showTimePicker(
                    context: context,
                    initialTime: _deadline,
                  );
                  if (picked != null) setState(() => _deadline = picked);
                },
                child: InputDecorator(
                  decoration: const InputDecoration(),
                  child: Row(
                    children: <Widget>[
                      const Icon(Icons.access_time_rounded, size: 18),
                      const SizedBox(width: 10),
                      Text(_deadline.format(context)),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 22),
              Text('Nombre maximum de membres', style: t.titleMedium),
              const SizedBox(height: 6),
              TextFormField(
                controller: _maxMembers,
                keyboardType: TextInputType.number,
                inputFormatters: <TextInputFormatter>[
                  FilteringTextInputFormatter.digitsOnly,
                ],
                decoration: const InputDecoration(hintText: 'Entre 2 et 60'),
                validator: (String? v) {
                  final int n = int.tryParse((v ?? '').trim()) ?? 0;
                  return (n >= 2 && n <= 60) ? null : 'Entre 2 et 60 membres.';
                },
              ),
              const SizedBox(height: 22),
              Text('Lieu de séance (facultatif)', style: t.titleMedium),
              const SizedBox(height: 6),
              TextFormField(
                controller: _place,
                textCapitalization: TextCapitalization.sentences,
                maxLength: 120,
                decoration: const InputDecoration(hintText: 'Ex. Boutique de M. Jean'),
              ),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.blue.shade50,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Icon(Icons.info_outline_rounded, color: Colors.blue.shade800, size: 22),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        'L\'ordre de passage se choisit à chaque saison, au démarrage du cycle : tirage au sort vérifiable, ordre d\'arrivée, ou décidé par le bureau. Amendes, caisse de secours et autres règles restent modifiables dans le règlement avant le premier cycle.',
                        style: t.bodySmall,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 26),
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
