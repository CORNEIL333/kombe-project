import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/formatters/douala_time.dart';
import '../../core/state/operation_result.dart';
import '../../core/state/resource.dart';
import '../../core/widgets/kombe_components.dart';
import '../../core/widgets/operation_feedback.dart';
import '../../core/widgets/screen_states.dart';
import '../../domain/entities/poll.dart';
import '../../domain/repositories/poll_repository.dart';
import '../../l10n/app_localizations.dart';

/// Votes libres d'un groupe (0041) : tout membre pose une question et
/// propose ses réponses. Un vote libre donne l'avis du groupe ; il ne change
/// rien tout seul. Chacun peut changer sa réponse tant que c'est ouvert.
class PollsScreen extends StatefulWidget {
  const PollsScreen({super.key, required this.groupId});
  final String groupId;

  @override
  State<PollsScreen> createState() => _PollsScreenState();
}

class _PollsScreenState extends State<PollsScreen> {
  Resource<List<Poll>> _state = const ResourceLoading<List<Poll>>();
  bool _showClosed = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final Resource<List<Poll>> next = await context.read<PollRepository>().listPolls(widget.groupId);
    if (mounted) setState(() => _state = next);
  }

  Future<void> _create() async {
    final PollDraft? draft = await Navigator.of(context).push<PollDraft>(
      MaterialPageRoute<PollDraft>(builder: (_) => const _NewPollScreen(), fullscreenDialog: true),
    );
    if (draft == null || !mounted) return;
    final OperationResult<Poll> r = await context.read<PollRepository>().openPoll(widget.groupId, draft);
    if (!mounted) return;
    if (reportOutcome(context, r)) {
      showKombeMessage(context, AppLocalizations.of(context).poVoteOuvertLesMembresSont);
      await _load();
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(AppLocalizations.of(context).gdVotesLibres)),
        floatingActionButton: FloatingActionButton.extended(
          onPressed: _create,
          icon: const Icon(Icons.add_rounded),
          label: Text(AppLocalizations.of(context).poPoserUneQuestion),
        ),
        body: RefreshIndicator(
          onRefresh: _load,
          child: ResourceView<List<Poll>>(
            resource: _state,
            builder: (BuildContext context, List<Poll> items) {
              final List<Poll> open = items.where((Poll p) => p.state == PollState.open).toList();
              final List<Poll> done = items.where((Poll p) => p.state != PollState.open).toList();
              return ListView(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 96),
                children: <Widget>[
                  Text(
                    AppLocalizations.of(context).poChaqueMembrePeutPoserUne,
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                  KombeSection(AppLocalizations.of(context).stInProgress),
                  if (open.isEmpty) Text(AppLocalizations.of(context).poAucunVoteEnCours),
                  for (final Poll p in open) Padding(padding: const EdgeInsets.only(bottom: 12), child: _PollCard(poll: p, onChanged: _load)),
                  if (done.isNotEmpty) ...<Widget>[
                    const SizedBox(height: 8),
                    TextButton(
                      onPressed: () => setState(() => _showClosed = !_showClosed),
                      child: Text(_showClosed ? AppLocalizations.of(context).poMasquerLesVotesTermines : AppLocalizations.of(context).poVoirLesVotesTermines(done.length)),
                    ),
                    if (_showClosed)
                      for (final Poll p in done) Padding(padding: const EdgeInsets.only(bottom: 12), child: _PollCard(poll: p, onChanged: _load)),
                  ],
                ],
              );
            },
          ),
        ),
      );
}

class _PollCard extends StatefulWidget {
  const _PollCard({required this.poll, required this.onChanged});
  final Poll poll;
  final Future<void> Function() onChanged;

  @override
  State<_PollCard> createState() => _PollCardState();
}

class _PollCardState extends State<_PollCard> {
  late List<int> _choices = <int>[...?widget.poll.myChoices];
  late final TextEditingController _free = TextEditingController(text: widget.poll.myFreeAnswer ?? '');
  bool _busy = false;
  bool _details = false;

  @override
  void dispose() {
    _free.dispose();
    super.dispose();
  }

  void _toggle(int i) => setState(() {
        if (widget.poll.multiple) {
          _choices = _choices.contains(i) ? (_choices..remove(i)) : (<int>[..._choices, i]..sort());
        } else {
          _choices = _choices.contains(i) ? <int>[] : <int>[i];
        }
      });

  Future<void> _run(Future<OperationResult<Poll>> Function(PollRepository r) op) async {
    setState(() => _busy = true);
    final OperationResult<Poll> r = await op(context.read<PollRepository>());
    if (!mounted) return;
    setState(() => _busy = false);
    if (reportOutcome(context, r)) await widget.onChanged();
  }

  @override
  Widget build(BuildContext context) {
    final Poll p = widget.poll;
    final TextTheme t = Theme.of(context).textTheme;
    final bool open = p.state == PollState.open;
    final int total = p.ballotCount == 0 ? 1 : p.ballotCount;
    final bool ready = _choices.isNotEmpty || _free.text.trim().isNotEmpty;
    return KombeCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(p.question, style: t.titleMedium),
          const SizedBox(height: 4),
          Text(
            '${AppLocalizations.of(context).poAskedByOn(p.createdByName, DoualaTime.date(p.createdAtUtc))}'
            '${p.closesAtUtc != null && open ? AppLocalizations.of(context).poUntil(DoualaTime.date(p.closesAtUtc!)) : ''}'
            '${p.anonymous ? AppLocalizations.of(context).poAnonymousSuffix : ''}',
            style: t.bodySmall,
          ),
          if (p.details != null && p.details!.isNotEmpty) ...<Widget>[const SizedBox(height: 6), Text(p.details!, style: t.bodyMedium)],
          const SizedBox(height: 8),
          StatusPill(pollStateLabel(p.state), tone: open ? KombeTone.info : KombeTone.neutral),
          const SizedBox(height: 10),
          for (int i = 0; i < p.options.length; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: InkWell(
                borderRadius: BorderRadius.circular(14),
                onTap: open && !_busy ? () => _toggle(i) : null,
                child: Ink(
                  padding: const EdgeInsets.fromLTRB(10, 8, 14, 10),
                  decoration: BoxDecoration(
                    color: _choices.contains(i) ? KombeColors.brand.withValues(alpha: 0.08) : KombeColors.cream,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: _choices.contains(i) ? KombeColors.brand : Colors.transparent, width: 1.5),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Row(
                        children: <Widget>[
                          Icon(
                            p.multiple
                                ? (_choices.contains(i) ? Icons.check_box_rounded : Icons.check_box_outline_blank_rounded)
                                : (_choices.contains(i) ? Icons.radio_button_checked_rounded : Icons.radio_button_off_rounded),
                            color: KombeColors.brand,
                          ),
                          const SizedBox(width: 8),
                          Expanded(child: Text(p.options[i], style: t.bodyLarge)),
                          Text(AppLocalizations.of(context).poVotes(i < p.counts.length ? p.counts[i] : 0), style: t.bodySmall),
                        ],
                      ),
                      const SizedBox(height: 6),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(99),
                        child: LinearProgressIndicator(
                          minHeight: 6,
                          value: (i < p.counts.length ? p.counts[i] : 0) / total,
                          color: KombeColors.brand,
                          backgroundColor: KombeColors.line,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          if (p.allowFreeAnswer && open)
            TextField(
              controller: _free,
              maxLength: 300,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(labelText: p.options.isEmpty ? AppLocalizations.of(context).poVotreReponse : AppLocalizations.of(context).poAutreReponseFacultatif),
            ),
          Text(AppLocalizations.of(context).poReponseSurMembres(p.ballotCount, p.electorate), style: t.bodySmall),
          if (p.freeAnswers.isNotEmpty || (p.voters?.isNotEmpty ?? false)) ...<Widget>[
            TextButton(onPressed: () => setState(() => _details = !_details), child: Text(_details ? AppLocalizations.of(context).poMasquerLeDetail : AppLocalizations.of(context).poVoirQuiReponduQuoi)),
            if (_details) ...<Widget>[
              for (final PollVoter v in p.voters ?? const <PollVoter>[])
                Text('${v.name} : ${v.choices.map((int c) => c < p.options.length ? p.options[c] : '').join(', ')}', style: t.bodySmall),
              for (final PollFreeAnswer f in p.freeAnswers) Text('« ${f.text} »${f.name != null ? ' — ${f.name}' : ''}', style: t.bodySmall),
            ],
          ],
          if (open) ...<Widget>[
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: <Widget>[
                FilledButton(
                  onPressed: _busy || !ready
                      ? null
                      : () => _run((PollRepository r) => r.answer(groupId: p.groupId, pollId: p.pollId, choices: _choices, freeAnswer: _free.text)),
                  child: Text(p.answered ? AppLocalizations.of(context).poChangerMaReponse : AppLocalizations.of(context).supportReply),
                ),
                if (p.canManage)
                  OutlinedButton(
                    onPressed: _busy ? null : () => _run((PollRepository r) => r.end(groupId: p.groupId, pollId: p.pollId, cancel: false)),
                    child: Text(AppLocalizations.of(context).poTerminer),
                  ),
                if (p.canManage)
                  TextButton(
                    onPressed: _busy ? null : () => _run((PollRepository r) => r.end(groupId: p.groupId, pollId: p.pollId, cancel: true)),
                    child: Text(AppLocalizations.of(context).cancel),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _NewPollScreen extends StatefulWidget {
  const _NewPollScreen();

  @override
  State<_NewPollScreen> createState() => _NewPollScreenState();
}

class _NewPollScreenState extends State<_NewPollScreen> {
  final TextEditingController _question = TextEditingController();
  final TextEditingController _details = TextEditingController();
  final List<TextEditingController> _options = <TextEditingController>[TextEditingController(), TextEditingController()];
  bool _free = false;
  bool _multiple = false;
  bool _anonymous = false;
  int _hours = 0;

  @override
  void dispose() {
    _question.dispose();
    _details.dispose();
    for (final TextEditingController c in _options) {
      c.dispose();
    }
    super.dispose();
  }

  List<String> get _filled => <String>[for (final TextEditingController c in _options) if (c.text.trim().isNotEmpty) c.text.trim()];

  bool get _ready => _question.text.trim().length >= 3 && (_filled.length >= 2 || (_filled.isEmpty && _free));

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(AppLocalizations.of(context).poPoserUneQuestion)),
        body: ListView(
          padding: const EdgeInsets.all(20),
          children: <Widget>[
            TextField(
              controller: _question,
              maxLength: 300,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(labelText: AppLocalizations.of(context).poVotreQuestion, hintText: AppLocalizations.of(context).poExQuelJourPourLa),
            ),
            TextField(controller: _details, maxLength: 2000, maxLines: 3, minLines: 1, decoration: InputDecoration(labelText: AppLocalizations.of(context).poPrecisionsFacultatif)),
            KombeSection(AppLocalizations.of(context).poReponsesProposees, padding: EdgeInsets.fromLTRB(0, 12, 0, 6)),
            for (int i = 0; i < _options.length; i++)
              Row(
                children: <Widget>[
                  Expanded(
                    child: TextField(
                      controller: _options[i],
                      maxLength: 120,
                      onChanged: (_) => setState(() {}),
                      decoration: InputDecoration(labelText: AppLocalizations.of(context).poAnswerN(i + 1)),
                    ),
                  ),
                  if (_options.length > 2)
                    IconButton(
                      tooltip: AppLocalizations.of(context).poRetirerCetteReponse,
                      onPressed: () => setState(() => _options.removeAt(i).dispose()),
                      icon: const Icon(Icons.close_rounded),
                    ),
                ],
              ),
            if (_options.length < 10)
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  onPressed: () => setState(() => _options.add(TextEditingController())),
                  icon: const Icon(Icons.add_rounded),
                  label: Text(AppLocalizations.of(context).poAjouterUneReponse),
                ),
              ),
            SwitchListTile(contentPadding: EdgeInsets.zero, value: _free, onChanged: (bool v) => setState(() => _free = v), title: Text(AppLocalizations.of(context).poAccepterUneReponseLibre)),
            SwitchListTile(contentPadding: EdgeInsets.zero, value: _multiple, onChanged: (bool v) => setState(() => _multiple = v), title: Text(AppLocalizations.of(context).poPlusieursReponsesPossibles)),
            SwitchListTile(contentPadding: EdgeInsets.zero, value: _anonymous, onChanged: (bool v) => setState(() => _anonymous = v), title: Text(AppLocalizations.of(context).poNePasMontrerQuiRepondu)),
            DropdownButtonFormField<int>(
              initialValue: _hours,
              decoration: InputDecoration(labelText: AppLocalizations.of(context).poDuree),
              items: <DropdownMenuItem<int>>[
                DropdownMenuItem<int>(value: 0, child: Text(AppLocalizations.of(context).poJusquaCeQueJeLe)),
                DropdownMenuItem<int>(value: 24, child: Text(AppLocalizations.of(context).po24Heures)),
                DropdownMenuItem<int>(value: 72, child: Text(AppLocalizations.of(context).po72Heures)),
                DropdownMenuItem<int>(value: 168, child: Text(AppLocalizations.of(context).poUneSemaine)),
              ],
              onChanged: (int? v) => setState(() => _hours = v ?? 0),
            ),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: !_ready
                  ? null
                  : () => Navigator.of(context).pop(PollDraft(
                        question: _question.text.trim(),
                        details: _details.text.trim(),
                        options: _filled,
                        allowFreeAnswer: _free,
                        multiple: _multiple && _filled.length >= 2,
                        anonymous: _anonymous,
                        hours: _hours == 0 ? null : _hours,
                      )),
              child: Text(AppLocalizations.of(context).poOuvrirLeVote),
            ),
          ],
        ),
      );
}
