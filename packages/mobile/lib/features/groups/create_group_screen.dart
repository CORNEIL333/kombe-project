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
import '../../l10n/app_localizations.dart';

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

  List<String> _jours(AppLocalizations l) => <String>[
        l.daySunday, l.dayMonday, l.dayTuesday, l.dayWednesday, l.dayThursday, l.dayFriday, l.daySaturday,
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
          ? AppLocalizations.of(context).chooseFirstMeetingDate
          : _firstDate!.isBefore(_today())
              ? AppLocalizations.of(context).firstMeetingNotPast
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
      showKombeMessage(context, AppLocalizations.of(context).tontineCreatedNext);
    }
  }

  static String _yyyyMmDd(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  String? _amount(String? v, {bool positive = true}) {
    final int n = int.tryParse((v ?? '').trim()) ?? 0;
    if (positive && n <= 0) return AppLocalizations.of(context).amountWholePositive;
    if (n > 1000000000) return AppLocalizations.of(context).amountTooHigh;
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
              decoration: InputDecoration(labelText: AppLocalizations.of(context).amountPerMemberPerMeeting),
              validator: (String? v) => _amount(v),
            ),
        ],
      );

  @override
  Widget build(BuildContext context) {
    final String locale = Localizations.localeOf(context).toLanguageTag();
    final TextTheme t = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: Text(AppLocalizations.of(context).createTontine)),
      body: SafeArea(
        child: Form(
          key: _form,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
            children: <Widget>[
              _Block(
                icon: Icons.diversity_3_rounded,
                title: AppLocalizations.of(context).theGroup,
                children: <Widget>[
                  _Field(
                    label: AppLocalizations.of(context).tontineName,
                    child: TextFormField(
                      controller: _name,
                      maxLength: 120,
                      textCapitalization: TextCapitalization.sentences,
                      textInputAction: TextInputAction.next,
                      decoration: InputDecoration(hintText: AppLocalizations.of(context).tontineNameHint, counterText: ''),
                      validator: (String? v) => (v == null || v.trim().isEmpty) ? AppLocalizations.of(context).nameRequired : null,
                    ),
                  ),
                  _Field(
                    label: AppLocalizations.of(context).maxMembers,
                    child: TextFormField(
                      controller: _maxMembers,
                      keyboardType: TextInputType.number,
                      inputFormatters: <TextInputFormatter>[FilteringTextInputFormatter.digitsOnly],
                      decoration: InputDecoration(hintText: AppLocalizations.of(context).between2And60),
                      validator: (String? v) {
                        final int n = int.tryParse((v ?? '').trim()) ?? 0;
                        return (n >= 2 && n <= 60) ? null : AppLocalizations.of(context).between2And60Members;
                      },
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              _Block(
                icon: Icons.payments_outlined,
                tone: KombeTone.money,
                title: AppLocalizations.of(context).theContribution,
                children: <Widget>[
                  _Field(
                    label: AppLocalizations.of(context).perSharePerMeeting,
                    help: AppLocalizations.of(context).perSharePerMeetingHelp,
                    child: TextFormField(
                      controller: _contribution,
                      keyboardType: TextInputType.number,
                      inputFormatters: <TextInputFormatter>[FilteringTextInputFormatter.digitsOnly],
                      style: KombeType.amount(size: 22),
                      decoration: InputDecoration(hintText: AppLocalizations.of(context).amountHint5000, suffixText: 'FCFA'),
                      validator: (String? v) => _amount(v),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              _Block(
                icon: Icons.event_outlined,
                tone: KombeTone.info,
                title: AppLocalizations.of(context).theMeetings,
                children: <Widget>[
                  _Field(
                    label: AppLocalizations.of(context).rhythm,
                    child: DropdownButtonFormField<CadenceKind>(
                      initialValue: _cadence,
                      isExpanded: true,
                      hint: Text(AppLocalizations.of(context).chooseRhythm),
                      borderRadius: BorderRadius.circular(KombeSpacing.fieldRadius),
                      dropdownColor: Colors.white,
                      items: <DropdownMenuItem<CadenceKind>>[
                        for (final CadenceKind k in CadenceKind.values) DropdownMenuItem<CadenceKind>(value: k, child: Text(cadenceKindLabel(k))),
                      ],
                      validator: (CadenceKind? v) => v == null ? AppLocalizations.of(context).chooseRhythmError : null,
                      onChanged: (CadenceKind? v) => setState(() => _cadence = v),
                    ),
                  ),
                  if (_cadence == CadenceKind.everyNDays)
                    _Field(
                      label: AppLocalizations.of(context).everyHowManyDays,
                      child: TextFormField(
                        controller: _everyN,
                        keyboardType: TextInputType.number,
                        inputFormatters: <TextInputFormatter>[FilteringTextInputFormatter.digitsOnly],
                        decoration: InputDecoration(hintText: AppLocalizations.of(context).everyNHint),
                        validator: (String? v) {
                          final int n = int.tryParse((v ?? '').trim()) ?? 0;
                          return n >= everyNDaysMin && n <= everyNDaysMax ? null : AppLocalizations.of(context).betweenNDays(everyNDaysMin, everyNDaysMax);
                        },
                      ),
                    ),
                  if (_needsWeekday)
                    _Field(
                      label: AppLocalizations.of(context).meetingDay,
                      child: DropdownButtonFormField<int>(
                        key: ValueKey<CadenceKind?>(_cadence),
                        initialValue: _weekday,
                        isExpanded: true,
                        hint: Text(AppLocalizations.of(context).chooseDay),
                        borderRadius: BorderRadius.circular(KombeSpacing.fieldRadius),
                        dropdownColor: Colors.white,
                        items: <DropdownMenuItem<int>>[
                          for (int j = 1; j <= 6; j++) DropdownMenuItem<int>(value: j, child: Text(_jours(AppLocalizations.of(context))[j])),
                          DropdownMenuItem<int>(value: 0, child: Text(AppLocalizations.of(context).daySunday)),
                        ],
                        validator: (int? v) => v == null ? AppLocalizations.of(context).chooseMeetingDayError : null,
                        onChanged: (int? v) => setState(() => _weekday = v),
                      ),
                    ),
                  if (_cadence == CadenceKind.monthlyDay)
                    _Field(
                      label: AppLocalizations.of(context).dayOfMonth,
                      child: DropdownButtonFormField<int>(
                        initialValue: _dayOfMonth,
                        isExpanded: true,
                        hint: Text(AppLocalizations.of(context).chooseDayOfMonth),
                        borderRadius: BorderRadius.circular(KombeSpacing.fieldRadius),
                        dropdownColor: Colors.white,
                        items: <DropdownMenuItem<int>>[
                          for (int d = 1; d <= 31; d++) DropdownMenuItem<int>(value: d, child: Text(AppLocalizations.of(context).dayOfMonthN(d))),
                        ],
                        validator: (int? v) => v == null ? AppLocalizations.of(context).chooseDayOfMonthError : null,
                        onChanged: (int? v) => setState(() => _dayOfMonth = v),
                      ),
                    ),
                  if (_cadence == CadenceKind.monthlyNthWeekday)
                    _Field(
                      label: AppLocalizations.of(context).whichWeekOfMonth,
                      child: DropdownButtonFormField<int>(
                        initialValue: _nth,
                        isExpanded: true,
                        hint: Text(AppLocalizations.of(context).chooseWeek),
                        borderRadius: BorderRadius.circular(KombeSpacing.fieldRadius),
                        dropdownColor: Colors.white,
                        items: <DropdownMenuItem<int>>[
                          DropdownMenuItem<int>(value: 1, child: Text(AppLocalizations.of(context).week1)),
                          DropdownMenuItem<int>(value: 2, child: Text(AppLocalizations.of(context).week2)),
                          DropdownMenuItem<int>(value: 3, child: Text(AppLocalizations.of(context).week3)),
                          DropdownMenuItem<int>(value: 4, child: Text(AppLocalizations.of(context).week4)),
                          DropdownMenuItem<int>(value: -1, child: Text(AppLocalizations.of(context).weekLast)),
                        ],
                        validator: (int? v) => v == null ? AppLocalizations.of(context).chooseWeekError : null,
                        onChanged: (int? v) => setState(() => _nth = v),
                      ),
                    ),
                  _Field(
                    label: AppLocalizations.of(context).firstMeetingDate,
                    child: _PickerField(
                      icon: Icons.calendar_today_outlined,
                      text: _firstDate == null ? AppLocalizations.of(context).chooseDate : DateFormat.yMMMMd(locale).format(_firstDate!),
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
                    label: AppLocalizations.of(context).contributionDeadline,
                    help: AppLocalizations.of(context).contributionDeadlineHelp,
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
                    label: AppLocalizations.of(context).meetingPlaceOptional,
                    child: TextFormField(
                      controller: _place,
                      textCapitalization: TextCapitalization.sentences,
                      maxLength: 120,
                      decoration: InputDecoration(hintText: AppLocalizations.of(context).meetingPlaceHint, counterText: ''),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              _Block(
                icon: Icons.account_balance_wallet_outlined,
                tone: KombeTone.money,
                title: AppLocalizations.of(context).fundsOptional,
                children: <Widget>[
                  Text(
                    AppLocalizations.of(context).fundsOptionalIntro,
                    style: t.bodySmall,
                  ),
                  _fundSwitch(
                    title: AppLocalizations.of(context).solidarityFund,
                    help: AppLocalizations.of(context).solidarityFundHelp,
                    value: _solidarityOn,
                    onChanged: (bool v) => setState(() => _solidarityOn = v),
                    controller: _solidarity,
                  ),
                  _fundSwitch(
                    title: AppLocalizations.of(context).operatingFund,
                    help: AppLocalizations.of(context).operatingFundHelp,
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
                          Text(AppLocalizations.of(context).otherCreationRules, style: t.titleSmall?.copyWith(color: KombeColors.forest)),
                          const SizedBox(height: 6),
                          Text(
                            AppLocalizations.of(context).creationRulesList,
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
                    : Text(AppLocalizations.of(context).createTheTontine),
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
