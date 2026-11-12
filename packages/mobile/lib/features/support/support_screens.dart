import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../app/active_group_controller.dart';
import '../../core/design/kombe_colors.dart';
import '../../core/formatters/douala_time.dart';
import '../../core/state/operation_result.dart';
import '../../core/state/resource.dart';
import '../../core/widgets/kombe_components.dart';
import '../../core/widgets/operation_feedback.dart';
import '../../core/widgets/screen_states.dart';
import '../../core/widgets/section_card.dart';
import '../../domain/entities/group.dart';
import '../../domain/entities/support_ticket.dart';
import '../../domain/repositories/support_repository.dart';
import '../../l10n/app_localizations.dart';

class HelpCenterScreen extends StatelessWidget {
  const HelpCenterScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l.helpCenterTitle)),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: <Widget>[
          Text(l.helpHeading, style: Theme.of(context).textTheme.headlineMedium),
          const SizedBox(height: 12),
          SectionCard(
            child: Column(
              children: <Widget>[
                ListTile(leading: const Icon(Icons.info_outline), title: Text(l.helpContributionTitle), subtitle: Text(l.helpContributionBody)),
                const Divider(),
                ListTile(leading: const Icon(Icons.gavel_outlined), title: Text(l.helpFineTitle), subtitle: Text(l.helpFineBody)),
                const Divider(),
                ListTile(leading: const Icon(Icons.offline_bolt_outlined), title: Text(l.helpOfflineTitle), subtitle: Text(l.helpOfflineBody)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Libellés traduits des états et sujets d'une demande.
String supportStatusText(AppLocalizations l, SupportStatus s) => switch (s) {
      SupportStatus.received => l.stReceived,
      SupportStatus.inProgress => l.stInProgress,
      SupportStatus.awaitingMe => l.stAwaitingMe,
      SupportStatus.resolved => l.stResolved,
      SupportStatus.closed => l.stClosed,
    };

String supportCategoryText(AppLocalizations l, String c) => switch (c) {
      'connexion' => l.catConnexion,
      'cotisation' => l.catCotisation,
      'remise' => l.catRemise,
      'amende' => l.catAmende,
      'statuts' => l.catStatuts,
      'application' => l.catApplication,
      'donnees_personnelles' => l.catDonnees,
      'reclamation' => l.catReclamation,
      _ => l.catAutre,
    };

/// « Nous contacter » : mes demandes au support KÓMBE (CRM, ADR-0046).
/// Une demande reçoit une référence (accusé de réception), son état est suivi
/// ici et la réponse se note une fois la demande résolue.
class ContactSupportScreen extends StatefulWidget {
  const ContactSupportScreen({super.key});

  @override
  State<ContactSupportScreen> createState() => _ContactSupportScreenState();
}

class _ContactSupportScreenState extends State<ContactSupportScreen> {
  Resource<List<SupportTicketSummary>> _state = const ResourceLoading<List<SupportTicketSummary>>();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final Resource<List<SupportTicketSummary>> next = await context.read<SupportRepository>().myTickets();
    if (mounted) setState(() => _state = next);
  }

  Future<void> _create() async {
    final SupportTicketDraft? draft = await Navigator.of(context).push<SupportTicketDraft>(
      MaterialPageRoute<SupportTicketDraft>(builder: (_) => const NewSupportTicketScreen(), fullscreenDialog: true),
    );
    if (draft == null || !mounted) return;
    final OperationResult<String> r = await context.read<SupportRepository>().open(draft);
    if (!mounted) return;
    if (r case OperationSuccess<String>(:final String value)) {
      showKombeMessage(context, value.isEmpty ? AppLocalizations.of(context).supportSent : AppLocalizations.of(context).supportSentRef(value));
      await _load();
    } else {
      reportOutcome(context, r);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(AppLocalizations.of(context).contactSupport)),
        floatingActionButton: FloatingActionButton.extended(
          onPressed: _create,
          icon: const Icon(Icons.support_agent_outlined),
          label: Text(AppLocalizations.of(context).supportContactCta),
        ),
        body: RefreshIndicator(
          onRefresh: _load,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 96),
            children: <Widget>[
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.groups_outlined),
                title: Text(AppLocalizations.of(context).supportGroupQuestion),
                subtitle: Text(AppLocalizations.of(context).supportGroupAnswer),
              ),
              Text(AppLocalizations.of(context).supportOtherwise),
              KombeSection(AppLocalizations.of(context).supportMyRequests, padding: const EdgeInsets.fromLTRB(0, 24, 0, 6)),
              ResourceView<List<SupportTicketSummary>>(
                resource: _state,
                builder: (BuildContext context, List<SupportTicketSummary> items) => items.isEmpty
                    ? Padding(padding: const EdgeInsets.symmetric(vertical: 12), child: Text(AppLocalizations.of(context).supportNoRequest))
                    : Column(
                        children: <Widget>[
                          for (final SupportTicketSummary t in items)
                            Card(
                              child: ListTile(
                                title: Text(t.subject),
                                subtitle: Text('${t.ref} · ${supportCategoryText(AppLocalizations.of(context), t.category)}${t.groupName == null ? '' : ' · ${t.groupName}'} · ${DoualaTime.dateTime(t.updatedAtUtc)}'),
                                trailing: Chip(label: Text(supportStatusText(AppLocalizations.of(context), t.status))),
                                onTap: () async {
                                  await context.push('/app/support/${Uri.encodeComponent(t.ticketId)}');
                                  if (mounted) await _load();
                                },
                              ),
                            ),
                        ],
                      ),
              ),
            ],
          ),
        ),
      );
}

class NewSupportTicketScreen extends StatefulWidget {
  const NewSupportTicketScreen({super.key});

  @override
  State<NewSupportTicketScreen> createState() => _NewSupportTicketScreenState();
}

class _NewSupportTicketScreenState extends State<NewSupportTicketScreen> {
  final TextEditingController _subject = TextEditingController();
  final TextEditingController _body = TextEditingController();
  String _category = 'application';
  String? _groupId;

  @override
  void dispose() {
    _subject.dispose();
    _body.dispose();
    super.dispose();
  }

  bool get _valid => _subject.text.trim().length >= 3 && _body.text.trim().length >= 10;

  @override
  Widget build(BuildContext context) {
    final List<GroupSummary> groups = context.watch<ActiveGroupController>().list;
    return Scaffold(
      appBar: AppBar(title: Text(AppLocalizations.of(context).supportContactCta)),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: <Widget>[
          DropdownButtonFormField<String>(
            initialValue: _category,
            decoration: InputDecoration(labelText: AppLocalizations.of(context).supportTopic),
            items: <DropdownMenuItem<String>>[
              for (final String c in supportCategories.keys) DropdownMenuItem<String>(value: c, child: Text(supportCategoryText(AppLocalizations.of(context), c), overflow: TextOverflow.ellipsis)),
            ],
            onChanged: (String? v) => setState(() => _category = v ?? 'autre'),
            isExpanded: true,
          ),
          if (groups.isNotEmpty) ...<Widget>[
            const SizedBox(height: 12),
            DropdownButtonFormField<String?>(
              initialValue: _groupId,
              decoration: InputDecoration(labelText: AppLocalizations.of(context).supportGroupConcerned),
              items: <DropdownMenuItem<String?>>[
                DropdownMenuItem<String?>(value: null, child: Text(AppLocalizations.of(context).supportNoGroup)),
                for (final GroupSummary g in groups) DropdownMenuItem<String?>(value: g.id, child: Text(g.name, overflow: TextOverflow.ellipsis)),
              ],
              onChanged: (String? v) => setState(() => _groupId = v),
              isExpanded: true,
            ),
          ],
          const SizedBox(height: 12),
          TextField(
            controller: _subject,
            maxLength: 140,
            decoration: InputDecoration(labelText: AppLocalizations.of(context).supportSubject),
            onChanged: (_) => setState(() {}),
          ),
          TextField(
            controller: _body,
            maxLength: 4000,
            minLines: 4,
            maxLines: 10,
            decoration: InputDecoration(
              labelText: AppLocalizations.of(context).supportMessage,
              helperText: AppLocalizations.of(context).supportMessageHelp,
              helperMaxLines: 3,
            ),
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _valid
                ? () => Navigator.of(context).pop(SupportTicketDraft(subject: _subject.text, category: _category, body: _body.text, groupId: _groupId))
                : null,
            child: Text(AppLocalizations.of(context).send),
          ),
        ],
      ),
    );
  }
}

class SupportTicketScreen extends StatefulWidget {
  const SupportTicketScreen({super.key, required this.ticketId});
  final String ticketId;

  @override
  State<SupportTicketScreen> createState() => _SupportTicketScreenState();
}

class _SupportTicketScreenState extends State<SupportTicketScreen> {
  Resource<SupportTicket> _state = const ResourceLoading<SupportTicket>();
  final TextEditingController _reply = TextEditingController();
  int _score = 0;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _reply.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final Resource<SupportTicket> next = await context.read<SupportRepository>().ticket(widget.ticketId);
    if (mounted) setState(() => _state = next);
  }

  Future<void> _run(Future<OperationResult<void>> Function(SupportRepository repo) op, String success) async {
    if (_busy) return;
    setState(() => _busy = true);
    final OperationResult<void> r = await op(context.read<SupportRepository>());
    if (!mounted) return;
    setState(() => _busy = false);
    if (reportOutcome(context, r)) {
      showKombeMessage(context, success);
      _reply.clear();
      await _load();
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(AppLocalizations.of(context).supportMyRequest)),
        body: RefreshIndicator(
          onRefresh: _load,
          child: ResourceView<SupportTicket>(
            resource: _state,
            builder: (BuildContext context, SupportTicket t) => ListView(
              padding: const EdgeInsets.all(20),
              children: <Widget>[
                Text(t.subject, style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 4),
                Text(AppLocalizations.of(context).supportRequestLine(t.ref, supportCategoryText(AppLocalizations.of(context), t.category), supportStatusText(AppLocalizations.of(context), t.status))),
                const SizedBox(height: 16),
                for (final SupportMessage m in t.messages)
                  Align(
                    alignment: m.fromMe ? Alignment.centerRight : Alignment.centerLeft,
                    child: Container(
                      margin: const EdgeInsets.only(bottom: 10),
                      padding: const EdgeInsets.all(12),
                      constraints: const BoxConstraints(maxWidth: 480),
                      decoration: BoxDecoration(
                        color: m.fromMe ? KombeColors.forest : Theme.of(context).colorScheme.surfaceContainerHighest,
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          Text(
                            '${m.fromMe ? AppLocalizations.of(context).supportYou : AppLocalizations.of(context).supportTeam} · ${DoualaTime.dateTime(m.createdAtUtc)}',
                            style: TextStyle(fontSize: 12, color: m.fromMe ? Colors.white70 : null),
                          ),
                          const SizedBox(height: 4),
                          Text(m.body, style: TextStyle(color: m.fromMe ? Colors.white : null)),
                        ],
                      ),
                    ),
                  ),
                if (t.canReply) ...<Widget>[
                  TextField(controller: _reply, maxLength: 4000, minLines: 2, maxLines: 6, decoration: InputDecoration(labelText: AppLocalizations.of(context).supportReply)),
                  FilledButton(
                    onPressed: _busy ? null : () => _reply.text.trim().isEmpty ? null : _run((SupportRepository r) => r.reply(t.ticketId, _reply.text), AppLocalizations.of(context).supportMessageSent),
                    child: Text(AppLocalizations.of(context).send),
                  ),
                ] else
                  Text(AppLocalizations.of(context).supportClosed),
                if (t.canRate) ...<Widget>[
                  KombeSection(AppLocalizations.of(context).supportDidItHelp, padding: const EdgeInsets.fromLTRB(0, 24, 0, 6)),
                  Wrap(
                    spacing: 8,
                    children: <Widget>[
                      for (int n = 1; n <= 5; n++)
                        ChoiceChip(label: Text('$n'), selected: _score == n, onSelected: (_) => setState(() => _score = n), tooltip: AppLocalizations.of(context).supportScoreOf(n)),
                    ],
                  ),
                  const SizedBox(height: 8),
                  FilledButton.tonal(
                    onPressed: _score < 1 || _busy ? null : () => _run((SupportRepository r) => r.rate(t.ticketId, _score), AppLocalizations.of(context).supportThanks),
                    child: Text(AppLocalizations.of(context).supportRate),
                  ),
                ] else if (t.satisfaction != null)
                  Padding(padding: const EdgeInsets.only(top: 16), child: Text(AppLocalizations.of(context).supportYourRating(t.satisfaction!))),
              ],
            ),
          ),
        ),
      );
}
