import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/design/kombe_spacing.dart';
import '../../core/design/kombe_theme.dart';
import '../../core/state/operation_result.dart';
import '../../core/widgets/kombe_components.dart';
import '../../core/widgets/operation_feedback.dart';
import '../../domain/entities/group.dart';
import '../../domain/repositories/group_repository.dart';

/// Écran de CRÉATION d'une tontine, branché sur l'API réelle
/// `POST /v1/tontines`. Le bureau saisit lui-même chaque paramètre : nom,
/// cotisation par part et par séance, rythme (aucun choisi d'avance), date de
/// première séance, heure limite de cotisation, plafond de membres, et les
/// caisses annexes qu'il veut ouvrir (fermées tant qu'il n'a pas tapé un
/// montant). Les autres règles appliquées sont écrites en clair.
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
  final TextEditingController _everyN = TextEditingController();
  final TextEditingController _solidarity = TextEditingController();
  final TextEditingController _operating = TextEditingController();
  CadenceKind? _cadence;
  int? _weekday;
  int? _dayOfMonth;
  int? _nth;
  DateTime? _firstDate;
  String? _firstDateError;
  TimeOfDay _deadline = const TimeOfDay(hour: 18, minute: 0);
  bool _solidarityOn = false;
  bool _operatingOn = false;
  bool _busy = false;

  static const List<String> _jours = <String>[
    'Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi',
  ];

  @override
  void dispose() {
    for (final TextEditingController c in <TextEditingController>[_name, _contribution, _maxMembers, _place, _everyN, _solidarity, _operating]) {
      c.dispose();
    }
    super.dispose();
  }

  static DateTime _today() {
    final DateTime n = DateTime.now();
    return DateTime(n.year, n.month, n.day);
  }

  bool get _needsWeekday =>
      _cadence == CadenceKind.weekly || _cadence == CadenceKind.biweekly || _cadence == CadenceKind.monthlyNthWeekday;

  Future<void> _submit() async {
    final bool formOk = _form.currentState?.validate() ?? false;
    setState(() {
      _firstDateError = _firstDate == null
          ? 'Choisissez la date de la première séance.'
          : _firstDate!.isBefore(_today())
              ? 'La première séance ne peut pas être dans le passé.'
              : null;
    });
    if (!formOk || _firstDateError != null || _busy) return;
    setState(() => _busy = true);
    final CadenceKind cadence = _cadence!;
    final OperationResult<String> result = await context.read<GroupRepository>().createGroup(TontineCreation(
          name: _name.text.trim(),
          contributionPerShare: _contribution.text.trim(),
          cadenceKind: cadence,
          weekday: _needsWeekday ? _weekday : null,
          dayOfMonth: cadence == CadenceKind.monthlyDay ? _dayOfMonth : null,
          nth: cadence == CadenceKind.monthlyNthWeekday ? _nth : null,
          everyNDays: cadence == CadenceKind.everyNDays ? int.tryParse(_everyN.text.trim()) : null,
          firstMeetingDate: _yyyyMmDd(_firstDate!),
          deadlineTime: '${_deadline.hour.toString().padLeft(2, '0')}:${_deadline.minute.toString().padLeft(2, '0')}',
          maxMembers: int.tryParse(_maxMembers.text.trim()) ?? 0,
          meetingPlace: _place.text.trim().isEmpty ? null : _place.text.trim(),
          solidarityPerMeeting: _solidarityOn ? int.tryParse(_solidarity.text.trim()) : null,
          operatingPerMeeting: _operatingOn ? int.tryParse(_operating.text.trim()) : null,
        ));
    if (!mounted) return;
    setState(() => _busy = false);
    if (reportOutcome(context, result)) {
      Navigator.of(context).pop();
      showKombeMessage(context, 'Tontine créée. Invitez ses membres, désignez un trésorier, puis publiez les statuts.');
    }
  }

  static String _yyyyMmDd(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  static String? _amount(String? v, {bool positive = true}) {
    final int n = int.tryParse((v ?? '').trim()) ?? 0;
    if (positive && n <= 0) return 'Montant entier requis, supérieur à 0.';
    if (n > 1000000000) return 'Montant trop élevé.';
    return null;
  }

  Widget _fundSwitch({
    required String title,
    required String help,
    required bool value,
    required ValueChanged<bool> onChanged,
    required TextEditingController controller,
  }) =>
      Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(title),
            subtitle: Text(help),
            value: value,
            onChanged: onChanged,
          ),
          if (value)
            TextFormField(
              controller: controller,
              keyboardType: TextInputType.number,
              inputFormatters: <TextInputFormatter>[FilteringTextInputFormatter.digitsOnly],
              decoration: const InputDecoration(labelText: 'Montant par membre et par séance (FCFA)'),
              validator: (String? v) => _amount(v),
            ),
        ],
      );

  @override
  Widget build(BuildContext context) {
    final String locale = Localizations.localeOf(context).toLanguageTag();
    final TextTheme t = Theme.of(context).textTheme;
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
                      maxLength: 120,
                      textCapitalization: TextCapitalization.sentences,
                      textInputAction: TextInputAction.next,
                      decoration: const InputDecoration(hintText: 'Ex. Tontine des artisans', counterText: ''),
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
                      validator: (String? v) => _amount(v),
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
                      hint: const Text('Choisir le rythme'),
                      borderRadius: BorderRadius.circular(KombeSpacing.fieldRadius),
                      dropdownColor: Colors.white,
                      items: <DropdownMenuItem<CadenceKind>>[
                        for (final CadenceKind k in CadenceKind.values) DropdownMenuItem<CadenceKind>(value: k, child: Text(cadenceKindLabel(k))),
                      ],
                      validator: (CadenceKind? v) => v == null ? 'Choisissez le rythme des séances.' : null,
                      onChanged: (CadenceKind? v) => setState(() => _cadence = v),
                    ),
                  ),
                  if (_cadence == CadenceKind.everyNDays)
                    _Field(
                      label: 'Tous les combien de jours ?',
                      child: TextFormField(
                        controller: _everyN,
                        keyboardType: TextInputType.number,
                        inputFormatters: <TextInputFormatter>[FilteringTextInputFormatter.digitsOnly],
                        decoration: const InputDecoration(hintText: 'Ex. 8'),
                        validator: (String? v) {
                          final int n = int.tryParse((v ?? '').trim()) ?? 0;
                          return n >= everyNDaysMin && n <= everyNDaysMax ? null : 'Entre $everyNDaysMin et $everyNDaysMax jours.';
                        },
                      ),
                    ),
                  if (_needsWeekday)
                    _Field(
                      label: 'Jour de séance',
                      child: DropdownButtonFormField<int>(
                        key: ValueKey<CadenceKind?>(_cadence),
                        initialValue: _weekday,
                        isExpanded: true,
                        hint: const Text('Choisir le jour'),
                        borderRadius: BorderRadius.circular(KombeSpacing.fieldRadius),
                        dropdownColor: Colors.white,
                        items: <DropdownMenuItem<int>>[
                          for (int j = 1; j <= 6; j++) DropdownMenuItem<int>(value: j, child: Text(_jours[j])),
                          const DropdownMenuItem<int>(value: 0, child: Text('Dimanche')),
                        ],
                        validator: (int? v) => v == null ? 'Choisissez le jour de séance.' : null,
                        onChanged: (int? v) => setState(() => _weekday = v),
                      ),
                    ),
                  if (_cadence == CadenceKind.monthlyDay)
                    _Field(
                      label: 'Jour du mois',
                      child: DropdownButtonFormField<int>(
                        initialValue: _dayOfMonth,
                        isExpanded: true,
                        hint: const Text('Choisir le jour du mois'),
                        borderRadius: BorderRadius.circular(KombeSpacing.fieldRadius),
                        dropdownColor: Colors.white,
                        items: <DropdownMenuItem<int>>[
                          for (int d = 1; d <= 31; d++) DropdownMenuItem<int>(value: d, child: Text('le $d')),
                        ],
                        validator: (int? v) => v == null ? 'Choisissez le jour du mois.' : null,
                        onChanged: (int? v) => setState(() => _dayOfMonth = v),
                      ),
                    ),
                  if (_cadence == CadenceKind.monthlyNthWeekday)
                    _Field(
                      label: 'Quelle semaine du mois',
                      child: DropdownButtonFormField<int>(
                        initialValue: _nth,
                        isExpanded: true,
                        hint: const Text('Choisir la semaine'),
                        borderRadius: BorderRadius.circular(KombeSpacing.fieldRadius),
                        dropdownColor: Colors.white,
                        items: const <DropdownMenuItem<int>>[
                          DropdownMenuItem<int>(value: 1, child: Text('1re')),
                          DropdownMenuItem<int>(value: 2, child: Text('2e')),
                          DropdownMenuItem<int>(value: 3, child: Text('3e')),
                          DropdownMenuItem<int>(value: 4, child: Text('4e')),
                          DropdownMenuItem<int>(value: -1, child: Text('Dernière')),
                        ],
                        validator: (int? v) => v == null ? 'Choisissez la semaine du mois.' : null,
                        onChanged: (int? v) => setState(() => _nth = v),
                      ),
                    ),
                  _Field(
                    label: 'Date de la première séance',
                    child: _PickerField(
                      icon: Icons.calendar_today_outlined,
                      text: _firstDate == null ? 'Choisir une date' : DateFormat.yMMMMd(locale).format(_firstDate!),
                      errorText: _firstDateError,
                      onTap: () async {
                        final DateTime today = _today();
                        final DateTime? picked = await showDatePicker(
                          context: context,
                          initialDate: _firstDate ?? today,
                          firstDate: today,
                          lastDate: today.add(const Duration(days: 366 * 2)),
                        );
                        if (picked != null) {
                          setState(() {
                            _firstDate = picked;
                            _firstDateError = null;
                          });
                        }
                      },
                    ),
                  ),
                  _Field(
                    label: 'Heure limite de cotisation',
                    help: 'Le jour de la séance, une cotisation versée après cette heure compte comme en retard.',
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
              _Block(
                icon: Icons.account_balance_wallet_outlined,
                tone: KombeTone.money,
                title: 'Les caisses (facultatif)',
                children: <Widget>[
                  Text(
                    'En plus de la cagnotte des tours, vous pouvez ouvrir des caisses annexes. Elles restent fermées si vous ne les activez pas.',
                    style: t.bodySmall,
                  ),
                  _fundSwitch(
                    title: 'Caisse de secours',
                    help: 'Aide aux membres en cas de deuil, maladie, naissance…',
                    value: _solidarityOn,
                    onChanged: (bool v) => setState(() => _solidarityOn = v),
                    controller: _solidarity,
                  ),
                  _fundSwitch(
                    title: 'Caisse de fonctionnement',
                    help: 'Petits frais du groupe (boissons, cahier, location de salle…).',
                    value: _operatingOn,
                    onChanged: (bool v) => setState(() => _operatingOn = v),
                    controller: _operating,
                  ),
                  const SizedBox(height: 10),
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
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          Text('Autres règles appliquées à la création', style: t.titleSmall?.copyWith(color: KombeColors.forest)),
                          const SizedBox(height: 6),
                          Text(
                            '• Tous les membres voient qui a cotisé.\n'
                            '• Aucune amende automatique (montants à 0).\n'
                            '• La remise d’un tour se fait devant 2 témoins.\n'
                            '• Les nouveaux venus passent en dernier.\n'
                            '• L’ordre des tours (tirage au sort vérifiable ou ordre d’arrivée) se choisit au démarrage du cycle.',
                            style: t.bodySmall?.copyWith(color: KombeColors.forest),
                          ),
                        ],
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
  const _PickerField({required this.icon, required this.text, required this.onTap, this.errorText});
  final IconData icon;
  final String text;
  final VoidCallback onTap;
  final String? errorText;

  @override
  Widget build(BuildContext context) => InkWell(
        borderRadius: BorderRadius.circular(KombeSpacing.fieldRadius),
        onTap: onTap,
        child: InputDecorator(
          decoration: InputDecoration(errorText: errorText),
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
