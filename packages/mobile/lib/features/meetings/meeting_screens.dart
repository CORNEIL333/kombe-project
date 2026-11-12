import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/formatters/douala_time.dart';
import '../../core/formatters/labels.dart';
import '../../core/state/resource.dart';
import '../../core/widgets/kombe_components.dart';
import '../../core/widgets/screen_states.dart';
import '../../domain/entities/meeting.dart';
import '../../domain/entities/group.dart';
import '../../domain/repositories/group_repository.dart';
import '../../domain/repositories/meeting_repository.dart';
import '../../core/state/operation_result.dart';
import '../../core/widgets/operation_feedback.dart';
import '../../l10n/app_localizations.dart';

KombeTone _toneOf(MeetingState s) => switch (s) {
      MeetingState.open => KombeTone.success,
      MeetingState.planned => KombeTone.info,
      MeetingState.closed || MeetingState.cancelled => KombeTone.neutral,
    };

KombeTone _toneOfAttendance(AttendanceStatus s) => switch (s) {
      AttendanceStatus.present || AttendanceStatus.represented => KombeTone.success,
      AttendanceStatus.late || AttendanceStatus.excused => KombeTone.warning,
      AttendanceStatus.absent => KombeTone.danger,
      AttendanceStatus.unknown => KombeTone.neutral,
    };

/// Liste des séances d'un groupe : à venir et en cours d'abord, puis passées.
class MeetingsScreen extends StatefulWidget {
  const MeetingsScreen({super.key, required this.groupId});
  final String groupId;

  @override
  State<MeetingsScreen> createState() => _MeetingsScreenState();
}

class _MeetingsScreenState extends State<MeetingsScreen> {
  Resource<List<MeetingSummary>> _state = const ResourceLoading<List<MeetingSummary>>();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final Resource<List<MeetingSummary>> next = await context.read<MeetingRepository>().listMeetings(widget.groupId);
    if (mounted) setState(() => _state = next);
  }

  Widget _row(BuildContext context, MeetingSummary m) {
    final TextTheme t = Theme.of(context).textTheme;
    return KombeCard(
      onTap: () => context.push('/app/groups/${widget.groupId}/meetings/${m.meetingId}'),
      child: Row(
        children: <Widget>[
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(AppLocalizations.of(context).meSeance(m.seq), style: t.titleMedium),
                const SizedBox(height: 2),
                Text(DoualaTime.date(m.date), style: t.bodyMedium),
                if (m.format != MeetingFormat.online && m.location != null) Text(m.location!, style: t.bodySmall),
                if (m.format != MeetingFormat.inPerson) Text(meetingFormatLabel(m.format), style: t.bodySmall),
                const SizedBox(height: 8),
                StatusPill(meetingStateLabel(m.state), tone: _toneOf(m.state)),
              ],
            ),
          ),
          const Icon(Icons.chevron_right_rounded),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(AppLocalizations.of(context).meSeances)),
        body: RefreshIndicator(
          onRefresh: _load,
          child: ResourceView<List<MeetingSummary>>(
            resource: _state,
            emptyWhen: (List<MeetingSummary> items) => items.isEmpty,
            emptyTitle: AppLocalizations.of(context).meAucuneSeance,
            emptyBody: AppLocalizations.of(context).meLesSeancesApparaitrontIciDes,
            builder: (BuildContext context, List<MeetingSummary> items) {
              final List<MeetingSummary> next = items.where((MeetingSummary m) => m.state == MeetingState.open || m.state == MeetingState.planned).toList();
              final List<MeetingSummary> past = items.where((MeetingSummary m) => !next.contains(m)).toList();
              return ListView(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                children: <Widget>[
                  if (next.isNotEmpty) KombeSection(AppLocalizations.of(context).benUpcoming),
                  for (final MeetingSummary m in next) Padding(padding: const EdgeInsets.only(bottom: 10), child: _row(context, m)),
                  if (past.isNotEmpty) KombeSection(AppLocalizations.of(context).mePassees),
                  for (final MeetingSummary m in past) Padding(padding: const EdgeInsets.only(bottom: 10), child: _row(context, m)),
                ],
              );
            },
          ),
        ),
      );
}

/// Détail d'une séance : lieu, présences et procès-verbal.
class MeetingDetailScreen extends StatefulWidget {
  const MeetingDetailScreen({super.key, required this.groupId, required this.meetingId});
  final String groupId;
  final String meetingId;

  @override
  State<MeetingDetailScreen> createState() => _MeetingDetailScreenState();
}

class _MeetingDetailScreenState extends State<MeetingDetailScreen> {
  Resource<MeetingDetail> _state = const ResourceLoading<MeetingDetail>();
  bool _bureau = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final GroupRepository groups = context.read<GroupRepository>();
    final Resource<MeetingDetail> next = await context.read<MeetingRepository>().getMeeting(groupId: widget.groupId, meetingId: widget.meetingId);
    final Resource<GroupDetails> g = await groups.getGroup(widget.groupId);
    if (mounted) {
      setState(() {
        _state = next;
        // Présidence et secrétariat (`meeting.manage`) règlent la modalité.
        _bureau = g is ResourceReady<GroupDetails> && g.data.summary.can(TontineAct.startCycle);
      });
    }
  }

  Future<void> _edit(MeetingDetail m) async {
    final _Modalite? v = await showModalBottomSheet<_Modalite>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _ModaliteSheet(meeting: m),
    );
    if (v == null || !mounted) return;
    final OperationResult<MeetingDetail> r = await context.read<MeetingRepository>().updateMeeting(
          groupId: widget.groupId,
          meetingId: widget.meetingId,
          format: v.format,
          onlineUrl: v.url,
          location: v.place,
        );
    if (!mounted) return;
    if (reportOutcome(context, r)) {
      showKombeMessage(context, AppLocalizations.of(context).meSeanceMiseJourLesMembres);
      await _load();
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(AppLocalizations.of(context).meSeance2)),
        body: RefreshIndicator(
          onRefresh: _load,
          child: ResourceView<MeetingDetail>(
            resource: _state,
            builder: (BuildContext context, MeetingDetail m) {
              final TextTheme t = Theme.of(context).textTheme;
              final MeetingMinutes? minutes = m.minutes;
              return ListView(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                children: <Widget>[
                  KombeCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Text(AppLocalizations.of(context).meSeance(m.seq), style: t.titleLarge),
                        const SizedBox(height: 8),
                        StatusPill(meetingStateLabel(m.state), tone: _toneOf(m.state)),
                        const SizedBox(height: 12),
                        KombeFact(icon: Icons.event_outlined, label: AppLocalizations.of(context).meDate, value: DoualaTime.date(m.date)),
                        KombeFact(icon: Icons.videocam_outlined, label: AppLocalizations.of(context).meModalite, value: meetingFormatLabel(m.format)),
                        if (m.format != MeetingFormat.online && m.location != null) KombeFact(icon: Icons.place_outlined, label: AppLocalizations.of(context).meLieu, value: m.location!),
                        if (m.hostName != null) KombeFact(icon: Icons.home_outlined, label: AppLocalizations.of(context).meRecoit, value: m.hostName!),
                        if (m.roundSeq != null) KombeFact(icon: Icons.donut_large_rounded, label: AppLocalizations.of(context).gdTour, value: '${m.roundSeq}'),
                      ],
                    ),
                  ),
                  if (_bureau && (m.state == MeetingState.planned || m.state == MeetingState.open)) ...<Widget>[
                    const SizedBox(height: 12),
                    OutlinedButton.icon(
                      onPressed: () => _edit(m),
                      icon: const Icon(Icons.tune_rounded),
                      label: Text(AppLocalizations.of(context).meCommentSeTientLaSeance),
                    ),
                  ],
                  if (m.onlineUrl != null && m.format != MeetingFormat.inPerson && (m.state == MeetingState.planned || m.state == MeetingState.open)) ...<Widget>[
                    const SizedBox(height: 12),
                    FilledButton.icon(
                      onPressed: () => launchUrl(Uri.parse(m.onlineUrl!), mode: LaunchMode.externalApplication),
                      icon: const Icon(Icons.videocam_rounded),
                      label: Text(AppLocalizations.of(context).meRejoindreLaReunionEnLigne),
                    ),
                  ],
                  if (m.notes != null && m.notes!.isNotEmpty) ...<Widget>[
                    KombeSection(AppLocalizations.of(context).meNotes),
                    KombeCard(child: Text(m.notes!)),
                  ],
                  if (m.attendance.isNotEmpty) ...<Widget>[
                    KombeSection(AppLocalizations.of(context).mePresences),
                    KombeCard(
                      child: Column(
                        children: <Widget>[
                          for (final MeetingAttendance a in m.attendance)
                            Padding(
                              padding: const EdgeInsets.symmetric(vertical: 6),
                              child: Row(
                                children: <Widget>[
                                  Expanded(child: Text(a.displayName)),
                                  const SizedBox(width: 8),
                                  StatusPill(attendanceStatusLabel(a.status), tone: _toneOfAttendance(a.status)),
                                ],
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                  if (minutes != null) ...<Widget>[
                    KombeSection(AppLocalizations.of(context).meProcesVerbal),
                    KombeCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          StatusPill(
                            m.minutesApproved ? AppLocalizations.of(context).meApprouve : AppLocalizations.of(context).meEnAttenteDapprobation,
                            tone: m.minutesApproved ? KombeTone.success : KombeTone.warning,
                          ),
                          const SizedBox(height: 10),
                          Text(minutes.text),
                        ],
                      ),
                    ),
                  ],
                ],
              );
            },
          ),
        ),
      );
}

final class _Modalite {
  const _Modalite(this.format, this.url, this.place);
  final MeetingFormat format;
  final String? url;
  final String? place;
}

class _ModaliteSheet extends StatefulWidget {
  const _ModaliteSheet({required this.meeting});
  final MeetingDetail meeting;

  @override
  State<_ModaliteSheet> createState() => _ModaliteSheetState();
}

class _ModaliteSheetState extends State<_ModaliteSheet> {
  late MeetingFormat _format = widget.meeting.format;
  late final TextEditingController _url = TextEditingController(text: widget.meeting.onlineUrl ?? '');
  late final TextEditingController _place = TextEditingController(text: widget.meeting.location ?? '');

  @override
  void dispose() {
    _url.dispose();
    _place.dispose();
    super.dispose();
  }

  bool get _ready => _format == MeetingFormat.inPerson || RegExp(r'^https://\S+$').hasMatch(_url.text.trim());

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + MediaQuery.viewInsetsOf(context).bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Text(AppLocalizations.of(context).meCommentSeTientLaSeance, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 12),
            SegmentedButton<MeetingFormat>(
              showSelectedIcon: false,
              segments: <ButtonSegment<MeetingFormat>>[
                for (final MeetingFormat f in MeetingFormat.values) ButtonSegment<MeetingFormat>(value: f, label: Text(meetingFormatLabel(f))),
              ],
              selected: <MeetingFormat>{_format},
              onSelectionChanged: (Set<MeetingFormat> v) => setState(() => _format = v.first),
            ),
            const SizedBox(height: 12),
            if (_format != MeetingFormat.online) TextField(controller: _place, maxLength: 120, decoration: InputDecoration(labelText: AppLocalizations.of(context).meLieu)),
            if (_format != MeetingFormat.inPerson)
              TextField(
                controller: _url,
                keyboardType: TextInputType.url,
                maxLength: 500,
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(labelText: AppLocalizations.of(context).meLienDeLaReunionEn, helperText: AppLocalizations.of(context).meLeLienCompletQuiCommence),
              ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: _ready ? () => Navigator.of(context).pop(_Modalite(_format, _url.text.trim(), _place.text.trim())) : null,
              child: Text(AppLocalizations.of(context).save),
            ),
          ],
        ),
      );
}
