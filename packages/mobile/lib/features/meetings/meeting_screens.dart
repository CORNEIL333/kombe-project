import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/formatters/douala_time.dart';
import '../../core/state/resource.dart';
import '../../core/widgets/kombe_components.dart';
import '../../core/widgets/screen_states.dart';
import '../../domain/entities/meeting.dart';
import '../../domain/repositories/meeting_repository.dart';

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
                Text('Séance ${m.seq}', style: t.titleMedium),
                const SizedBox(height: 2),
                Text(DoualaTime.date(m.date), style: t.bodyMedium),
                if (m.location != null) Text(m.location!, style: t.bodySmall),
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
        appBar: AppBar(title: const Text('Séances')),
        body: RefreshIndicator(
          onRefresh: _load,
          child: ResourceView<List<MeetingSummary>>(
            resource: _state,
            emptyWhen: (List<MeetingSummary> items) => items.isEmpty,
            emptyTitle: 'Aucune séance',
            emptyBody: 'Les séances apparaîtront ici dès que le cycle aura démarré.',
            builder: (BuildContext context, List<MeetingSummary> items) {
              final List<MeetingSummary> next = items.where((MeetingSummary m) => m.state == MeetingState.open || m.state == MeetingState.planned).toList();
              final List<MeetingSummary> past = items.where((MeetingSummary m) => !next.contains(m)).toList();
              return ListView(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                children: <Widget>[
                  if (next.isNotEmpty) const KombeSection('À venir'),
                  for (final MeetingSummary m in next) Padding(padding: const EdgeInsets.only(bottom: 10), child: _row(context, m)),
                  if (past.isNotEmpty) const KombeSection('Passées'),
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

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final Resource<MeetingDetail> next = await context.read<MeetingRepository>().getMeeting(groupId: widget.groupId, meetingId: widget.meetingId);
    if (mounted) setState(() => _state = next);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Séance')),
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
                        Text('Séance ${m.seq}', style: t.titleLarge),
                        const SizedBox(height: 8),
                        StatusPill(meetingStateLabel(m.state), tone: _toneOf(m.state)),
                        const SizedBox(height: 12),
                        KombeFact(icon: Icons.event_outlined, label: 'Date', value: DoualaTime.date(m.date)),
                        if (m.location != null) KombeFact(icon: Icons.place_outlined, label: 'Lieu', value: m.location!),
                        if (m.hostName != null) KombeFact(icon: Icons.home_outlined, label: 'Reçoit', value: m.hostName!),
                        if (m.roundSeq != null) KombeFact(icon: Icons.donut_large_rounded, label: 'Tour', value: '${m.roundSeq}'),
                      ],
                    ),
                  ),
                  if (m.notes != null && m.notes!.isNotEmpty) ...<Widget>[
                    const KombeSection('Notes'),
                    KombeCard(child: Text(m.notes!)),
                  ],
                  if (m.attendance.isNotEmpty) ...<Widget>[
                    const KombeSection('Présences'),
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
                    const KombeSection('Procès-verbal'),
                    KombeCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          StatusPill(
                            m.minutesApproved ? 'Approuvé' : 'En attente d’approbation',
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
