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

class HelpCenterScreen extends StatelessWidget {
  const HelpCenterScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Centre d’aide')),
        body: ListView(
          padding: const EdgeInsets.all(20),
          children: <Widget>[
            Text(
              'Aide KÓMBE',
              style: Theme.of(context).textTheme.headlineMedium,
            ),
            const SizedBox(height: 12),
            const SectionCard(
              child: Column(
                children: <Widget>[
                  ListTile(
                    leading: Icon(Icons.info_outline),
                    title: Text('Comprendre une cotisation'),
                    subtitle: Text(
                      'Vous payez le trésorier comme d’habitude (espèces, Mobile Money…), puis vous déclarez le versement. '
                      'Il compte quand le trésorier l’a confirmé. KÓMBE ne garde jamais l’argent.',
                    ),
                  ),
                  Divider(),
                  ListTile(
                    leading: Icon(Icons.gavel_outlined),
                    title: Text('Contester une amende'),
                    subtitle: Text(
                      'Depuis le menu, ouvrez « Mes amendes » et contestez une amende avec un motif ; la présidence l’annule ou la maintient.',
                    ),
                  ),
                  Divider(),
                  ListTile(
                    leading: Icon(Icons.offline_bolt_outlined),
                    title: Text('Sans réseau'),
                    subtitle: Text(
                      'Vos brouillons restent sur ce téléphone. Envoyez-les quand le réseau revient : rien ne part deux fois.',
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
}

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
      showKombeMessage(context, value.isEmpty ? 'Demande envoyée.' : 'Demande $value envoyée : le support vous répond ici.');
      await _load();
    } else {
      reportOutcome(context, r);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Nous contacter')),
        floatingActionButton: FloatingActionButton.extended(
          onPressed: _create,
          icon: const Icon(Icons.support_agent_outlined),
          label: const Text('Contacter le support'),
        ),
        body: RefreshIndicator(
          onRefresh: _load,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 96),
            children: <Widget>[
              const ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(Icons.groups_outlined),
                title: Text('Une question sur votre groupe ?'),
                subtitle: Text('Le bureau de votre tontine est le premier à pouvoir vous répondre.'),
              ),
              const Text('Pour tout le reste, l’équipe KÓMBE vous répond ici, en général sous 24 h ouvrées.'),
              const KombeSection('Mes demandes', padding: EdgeInsets.fromLTRB(0, 24, 0, 6)),
              ResourceView<List<SupportTicketSummary>>(
                resource: _state,
                builder: (BuildContext context, List<SupportTicketSummary> items) => items.isEmpty
                    ? const Padding(padding: EdgeInsets.symmetric(vertical: 12), child: Text('Aucune demande pour l’instant.'))
                    : Column(
                        children: <Widget>[
                          for (final SupportTicketSummary t in items)
                            Card(
                              child: ListTile(
                                title: Text(t.subject),
                                subtitle: Text('${t.ref} · ${supportCategoryLabel(t.category)}${t.groupName == null ? '' : ' · ${t.groupName}'} · ${DoualaTime.dateTime(t.updatedAtUtc)}'),
                                trailing: Chip(label: Text(supportStatusLabel(t.status))),
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
      appBar: AppBar(title: const Text('Contacter le support')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: <Widget>[
          DropdownButtonFormField<String>(
            initialValue: _category,
            decoration: const InputDecoration(labelText: 'Sujet'),
            items: <DropdownMenuItem<String>>[
              for (final MapEntry<String, String> c in supportCategories.entries) DropdownMenuItem<String>(value: c.key, child: Text(c.value, overflow: TextOverflow.ellipsis)),
            ],
            onChanged: (String? v) => setState(() => _category = v ?? 'autre'),
            isExpanded: true,
          ),
          if (groups.isNotEmpty) ...<Widget>[
            const SizedBox(height: 12),
            DropdownButtonFormField<String?>(
              initialValue: _groupId,
              decoration: const InputDecoration(labelText: 'Tontine concernée'),
              items: <DropdownMenuItem<String?>>[
                const DropdownMenuItem<String?>(value: null, child: Text('Aucune en particulier')),
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
            decoration: const InputDecoration(labelText: 'Objet'),
            onChanged: (_) => setState(() {}),
          ),
          TextField(
            controller: _body,
            maxLength: 4000,
            minLines: 4,
            maxLines: 10,
            decoration: const InputDecoration(
              labelText: 'Votre message',
              helperText: 'Décrivez ce qui se passe (10 caractères au moins). N’écrivez jamais de code de connexion.',
              helperMaxLines: 3,
            ),
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _valid
                ? () => Navigator.of(context).pop(SupportTicketDraft(subject: _subject.text, category: _category, body: _body.text, groupId: _groupId))
                : null,
            child: const Text('Envoyer'),
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
        appBar: AppBar(title: const Text('Ma demande')),
        body: RefreshIndicator(
          onRefresh: _load,
          child: ResourceView<SupportTicket>(
            resource: _state,
            builder: (BuildContext context, SupportTicket t) => ListView(
              padding: const EdgeInsets.all(20),
              children: <Widget>[
                Text(t.subject, style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 4),
                Text('Demande ${t.ref} · ${supportCategoryLabel(t.category)} · ${supportStatusLabel(t.status)}'),
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
                            '${m.fromMe ? 'Vous' : 'Support KÓMBE'} · ${DoualaTime.dateTime(m.createdAtUtc)}',
                            style: TextStyle(fontSize: 12, color: m.fromMe ? Colors.white70 : null),
                          ),
                          const SizedBox(height: 4),
                          Text(m.body, style: TextStyle(color: m.fromMe ? Colors.white : null)),
                        ],
                      ),
                    ),
                  ),
                if (t.canReply) ...<Widget>[
                  TextField(controller: _reply, maxLength: 4000, minLines: 2, maxLines: 6, decoration: const InputDecoration(labelText: 'Répondre')),
                  FilledButton(
                    onPressed: _busy ? null : () => _reply.text.trim().isEmpty ? null : _run((SupportRepository r) => r.reply(t.ticketId, _reply.text), 'Message envoyé.'),
                    child: const Text('Envoyer'),
                  ),
                ] else
                  const Text('Cette demande est close. Ouvrez-en une nouvelle si besoin.'),
                if (t.canRate) ...<Widget>[
                  const KombeSection('La réponse vous a-t-elle aidé ?', padding: EdgeInsets.fromLTRB(0, 24, 0, 6)),
                  Wrap(
                    spacing: 8,
                    children: <Widget>[
                      for (int n = 1; n <= 5; n++)
                        ChoiceChip(label: Text('$n'), selected: _score == n, onSelected: (_) => setState(() => _score = n), tooltip: '$n sur 5'),
                    ],
                  ),
                  const SizedBox(height: 8),
                  FilledButton.tonal(
                    onPressed: _score < 1 || _busy ? null : () => _run((SupportRepository r) => r.rate(t.ticketId, _score), 'Merci pour votre avis.'),
                    child: const Text('Noter la réponse'),
                  ),
                ] else if (t.satisfaction != null)
                  Padding(padding: const EdgeInsets.only(top: 16), child: Text('Votre note : ${t.satisfaction} sur 5')),
              ],
            ),
          ),
        ),
      );
}
