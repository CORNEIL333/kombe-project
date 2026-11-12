import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../l10n/app_localizations.dart';
import '../../core/design/kombe_colors.dart';
import '../../core/design/kombe_theme.dart';
import '../../core/formatters/xaf.dart';
import '../../core/widgets/group_avatar.dart';
import '../../core/widgets/kombe_components.dart';
import '../../domain/entities/contribution.dart';
import '../../domain/entities/dashboard.dart';
import '../../domain/entities/group.dart';
import '../../domain/entities/notification.dart';
import '../groups/group_photo_sheet.dart';
import '../notifications/notification_actions.dart';
import '../notifications/notifications_screen.dart';

String _day(BuildContext context, DateTime utc) =>
    DateFormat('EEEE d MMMM', Localizations.localeOf(context).toLanguageTag()).format(utc.toLocal());

/// Accueil « Ndop ». Emplacements STABLES, dans cet ordre :
/// héros vert (salutation, reste à régler, échéance, action principale, à
/// confirmer, perles du cycle) ; raccourcis du groupe ; « À faire » (règles explicables : envoi à
/// reprendre, confirmations de ma fonction, vote ouvert) ; prochaine séance ;
/// activité récente du groupe. Aucune donnée inventée.
class HomeContent extends StatelessWidget {
  const HomeContent({super.key, required this.data, this.drafts = const <ContributionDraft>[], this.now, this.firstName, this.photoMissing = false, this.myName = '', this.myPhotoVersion});
  final HomeData data;
  final List<ContributionDraft> drafts;
  final DateTime? now;
  final String? firstName;
  /// Je n'ai pas encore de photo de profil.
  final bool photoMissing;
  final String myName;
  final int? myPhotoVersion;

  @override
  Widget build(BuildContext context) {
    final String gid = Uri.encodeComponent(data.group.id);
    final List<Widget> todo = <Widget>[
      for (final ContributionDraft d in drafts)
        _TodoRow(
          icon: d.sending ? Icons.sync_problem_rounded : Icons.edit_note_rounded,
          tone: d.sending ? KombeTone.danger : KombeTone.brand,
          title: d.sending ? AppLocalizations.of(context).dashResumeSending : AppLocalizations.of(context).dashFinishPayment,
          subtitle: '${Xaf.format(d.amountXaf)} · ${d.sending ? AppLocalizations.of(context).dashNoDoubleDeclare : AppLocalizations.of(context).dashNotSentYet}',
          onTap: () => context.push('/app/groups/$gid/contributions/new?draft=${Uri.encodeComponent(d.localId)}'),
        ),
      if (data.toValidate > 0)
        _TodoRow(
          icon: Icons.fact_check_outlined,
          tone: KombeTone.money,
          title: data.group.role == GroupRole.controller
              ? AppLocalizations.of(context).dashToControl(data.toValidate)
              : AppLocalizations.of(context).dashToConfirm(data.toValidate),
          subtitle: AppLocalizations.of(context).dashBureau,
          onTap: () => context.push('/app/validations'),
        ),
      if (photoMissing)
        _TodoRow(
          icon: Icons.add_a_photo_outlined,
          tone: KombeTone.brand,
          title: AppLocalizations.of(context).dashAddYourPhoto,
          subtitle: AppLocalizations.of(context).dashGroupRecognizes,
          onTap: () => context.push('/app/profile'),
        ),
      if (data.group.photoVersion == null && canEditGroupPhoto(data.group.role))
        _TodoRow(
          icon: Icons.add_photo_alternate_outlined,
          tone: KombeTone.brand,
          title: AppLocalizations.of(context).dashAddGroupPhoto,
          subtitle: data.group.name,
          onTap: () => context.push('/app/groups/$gid'),
        ),
      if (data.openPolls > 0)
        _TodoRow(
          icon: Icons.ballot_outlined,
          tone: KombeTone.info,
          title: AppLocalizations.of(context).dashOpenPolls(data.openPolls),
          subtitle: AppLocalizations.of(context).dashYourOpinion,
          onTap: () => context.push('/app/groups/$gid/polls'),
        ),
      for (final PendingVote v in data.votes)
        _TodoRow(
          icon: Icons.how_to_vote_outlined,
          tone: KombeTone.info,
          title: AppLocalizations.of(context).dashVoteTitle(v.title),
          subtitle: AppLocalizations.of(context).dashUntil(_day(context, v.closesAtUtc)),
          onTap: () => context.push('/app/votes/${Uri.encodeComponent(v.id)}'),
        ),
    ];
    final GroupSummary g = data.group;
    return ListView(
      padding: const EdgeInsets.only(bottom: 32),
      children: <Widget>[
        _Hero(data: data, firstName: firstName, myName: myName, myPhotoVersion: myPhotoVersion),
        // Raccourcis du groupe : quatre entrées, toujours au même endroit.
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 18, 12, 0),
          child: Row(
            children: <Widget>[
              _Shortcut(tone: KombeTone.success, icon: Icons.donut_large_rounded, label: AppLocalizations.of(context).cycle, onTap: () => context.push('/app/groups/$gid/cycle')),
              _Shortcut(tone: KombeTone.brand, icon: Icons.groups_2_outlined, label: AppLocalizations.of(context).members, onTap: () => context.push('/app/groups/$gid/members')),
              _Shortcut(tone: KombeTone.money, icon: Icons.account_balance_wallet_outlined, label: AppLocalizations.of(context).gdCaisses, onTap: () => context.push('/app/groups/$gid/funds')),
              _Shortcut(tone: KombeTone.info, icon: Icons.menu_book_outlined, label: AppLocalizations.of(context).rules, onTap: () => context.push('/app/groups/$gid/rules')),
            ],
          ),
        ),
        if (data.rounds.isNotEmpty) ...<Widget>[
          KombeSection(AppLocalizations.of(context).dashboard),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: RoundsDashboard(rounds: data.rounds, onOpen: () => context.push('/app/groups/$gid/cycle')),
          ),
        ],
        if (todo.isNotEmpty) ...<Widget>[
          KombeSection(AppLocalizations.of(context).daFaire, action: AppLocalizations.of(context).daToutVoir, onAction: () => context.go('/app/notifications')),
          KombeGroupedList(children: todo),
        ],
        if (data.nextMeetingDate != null) ...<Widget>[
          KombeSection(AppLocalizations.of(context).dashNextMeeting),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: _MeetingCard(date: data.nextMeetingDate!, place: data.nextMeetingOnline ? <String>[if (data.nextMeetingPlace != null) data.nextMeetingPlace!, AppLocalizations.of(context).daEnLigne].join(' · ') : data.nextMeetingPlace, group: g.name, onTap: () => context.push('/app/groups/$gid')),
          ),
        ],
        KombeSection(AppLocalizations.of(context).dashRecentActivity, action: data.recent.isEmpty ? null : AppLocalizations.of(context).dashHistory, onAction: () => context.go('/app/notifications')),
        if (data.recent.isEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 0),
            child: Text(AppLocalizations.of(context).dashNothingNew),
          )
        else
          KombeGroupedList(
            children: <Widget>[
              for (final KombeNotification n in data.recent.take(4)) NotificationTile(n: n, now: now, onTap: () => openNotification(context, n)),
            ],
          ),
      ],
    );
  }
}

/// Héros de l'accueil : prolonge la barre. Un seul message (ce que je dois, ou
/// « à jour »), une action, puis le rang de perles du cycle.
class _Hero extends StatelessWidget {
  const _Hero({required this.data, this.firstName, this.myName = '', this.myPhotoVersion});
  final HomeData data;
  final String? firstName;
  final String myName;
  final int? myPhotoVersion;

  @override
  Widget build(BuildContext context) {
    final int due = data.remainingXaf;
    final String gid = Uri.encodeComponent(data.group.id);
    const TextStyle soft = TextStyle(color: Colors.white, fontSize: 15, height: 1.35, fontWeight: FontWeight.w600);
    final bool cycle = data.group.cycleTotal > 0 && data.group.cycleIndex > 0;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        DecoratedBox(
          decoration: const BoxDecoration(color: KombeColors.brand, borderRadius: BorderRadius.vertical(bottom: Radius.circular(28))),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 6, 20, 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                Row(
                  children: <Widget>[
                    if (myName.isNotEmpty) ...<Widget>[
                      MyAvatar(name: myName, photoVersion: myPhotoVersion, size: 40),
                      const SizedBox(width: 10),
                    ],
                    Expanded(child: Text(firstName == null ? AppLocalizations.of(context).dashHello : AppLocalizations.of(context).dashHelloName(firstName ?? ''), style: soft)),
                  ],
                ),
                const SizedBox(height: 18),
                if (due > 0) ...<Widget>[
                  Text(AppLocalizations.of(context).dashToPay, style: soft),
                  const SizedBox(height: 4),
                  FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: Alignment.centerLeft,
                    child: KombeAmount(due, size: 54, color: Colors.white),
                  ),
                  const SizedBox(height: 6),
                  if (data.late)
                    StatusPill(AppLocalizations.of(context).dashLate, tone: KombeTone.danger, icon: Icons.error_outline_rounded)
                  else
                    Text(data.nextDueDate == null ? AppLocalizations.of(context).dashForThisRound : AppLocalizations.of(context).dashBefore(_day(context, data.nextDueDate!)), style: soft.copyWith(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 18),
                  FilledButton.icon(
                    style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(56)),
                    onPressed: () => context.push('/app/groups/$gid/contributions/new'),
                    icon: const Icon(Icons.check_rounded),
                    label: Text(AppLocalizations.of(context).declareContribution),
                  ),
                ] else ...<Widget>[
                  Text(AppLocalizations.of(context).dashUpToDate, style: KombeType.display(size: 38, color: Colors.white)),
                  const SizedBox(height: 18),
                ],
                if (data.pendingDeclarations > 0) ...<Widget>[
                  const SizedBox(height: 10),
                  Material(
                    type: MaterialType.transparency,
                    child: InkWell(
                      borderRadius: BorderRadius.circular(10),
                      onTap: () => context.go('/app/contributions'),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        child: Row(
                          children: <Widget>[
                            const Icon(Icons.hourglass_top_rounded, size: 18, color: Colors.white),
                            const SizedBox(width: 8),
                            Expanded(child: Text(AppLocalizations.of(context).daConfirmer(Xaf.format(data.pendingDeclaredXaf)), style: soft)),
                            const Icon(Icons.chevron_right_rounded, size: 20, color: Colors.white),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
                if (cycle) ...<Widget>[
                  const SizedBox(height: 14),
                  KombeCycleBand(index: data.group.cycleIndex, total: data.group.cycleTotal, onDark: true, late: data.late),
                  const SizedBox(height: 8),
                  Text(AppLocalizations.of(context).dashRoundOf(data.group.cycleIndex, data.group.cycleTotal), style: soft),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }
}

/// Raccourci : picto dans un disque, libellé dessous.
class _Shortcut extends StatelessWidget {
  const _Shortcut({required this.tone, required this.icon, required this.label, required this.onTap});
  final KombeTone tone;
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Expanded(
        child: Semantics(
          button: true,
          label: label,
          excludeSemantics: true,
          child: InkWell(
            borderRadius: BorderRadius.circular(18),
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Column(
                children: <Widget>[
                  Container(
                    width: 52,
                    height: 52,
                    decoration: BoxDecoration(color: tone.bg, shape: BoxShape.circle),
                    child: Icon(icon, color: tone.fg, size: 24),
                  ),
                  const SizedBox(height: 6),
                  Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: KombeColors.ink)),
                ],
              ),
            ),
          ),
        ),
      );
}

/// Prochaine séance : pavé calendrier, jour en toutes lettres, lieu.
class _MeetingCard extends StatelessWidget {
  const _MeetingCard({required this.date, required this.place, required this.group, required this.onTap});
  final DateTime date;
  final String? place;
  final String group;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
        button: true,
        child: KombeCard(
          onTap: onTap,
          padding: const EdgeInsets.all(14),
          child: Row(
            children: <Widget>[
              KombeDateBlock(date),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(toBeginningOfSentenceCase(_day(context, date)), style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 3),
                    Row(
                      children: <Widget>[
                        const Icon(Icons.place_outlined, size: 15, color: KombeColors.slate),
                        const SizedBox(width: 4),
                        Flexible(child: Text(place ?? group, maxLines: 1, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.bodyMedium)),
                      ],
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded, color: KombeColors.slate),
            ],
          ),
        ),
      );
}

class _TodoRow extends StatelessWidget {
  const _TodoRow({required this.icon, required this.title, required this.subtitle, required this.onTap, this.tone = KombeTone.brand});
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final KombeTone tone;

  @override
  Widget build(BuildContext context) => ListTile(
        minTileHeight: 68,
        leading: KombeIconBadge(icon, tone: tone),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
        subtitle: Text(subtitle),
        trailing: const Icon(Icons.chevron_right_rounded, color: KombeColors.slate),
        onTap: onTap,
      );
}

/// Silhouette de l'accueil : mêmes blocs que le contenu réel, aucune valeur.
class HomeSkeleton extends StatelessWidget {
  const HomeSkeleton({super.key});

  @override
  Widget build(BuildContext context) => Semantics(
        label: AppLocalizations.of(context).loading,
        child: ListView(
          physics: const NeverScrollableScrollPhysics(),
          children: <Widget>[
            Container(
              height: 320,
              decoration: const BoxDecoration(color: KombeColors.brand, borderRadius: BorderRadius.vertical(bottom: Radius.circular(28))),
            ),
            const SizedBox(height: 22),
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 24),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: <Widget>[
                  KombeSkeleton(width: 52, height: 52, radius: 26),
                  KombeSkeleton(width: 52, height: 52, radius: 26),
                  KombeSkeleton(width: 52, height: 52, radius: 26),
                  KombeSkeleton(width: 52, height: 52, radius: 26),
                ],
              ),
            ),
            const SizedBox(height: 30),
            const Padding(padding: EdgeInsets.symmetric(horizontal: 20), child: KombeSkeleton(width: 120, height: 16)),
            const SizedBox(height: 12),
            const Padding(padding: EdgeInsets.symmetric(horizontal: 20), child: KombeSkeleton(height: 136, radius: 22)),
          ],
        ),
      );
}

/// Aucun groupe : rejoindre (code reçu du bureau) ou créer.
class NoGroupHome extends StatelessWidget {
  const NoGroupHome({super.key});

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    return ListView(
      padding: const EdgeInsets.fromLTRB(24, 32, 24, 24),
      children: <Widget>[
        const Center(child: KombeEmptyArt(icon: Icons.diversity_3_rounded, size: 150)),
        const SizedBox(height: 24),
        Text(AppLocalizations.of(context).dashWelcome, style: t.headlineMedium, textAlign: TextAlign.center),
        const SizedBox(height: 10),
        Text(
          AppLocalizations.of(context).dashWelcomeBody,
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 28),
        FilledButton.icon(
          onPressed: () => context.push('/app/groups/join'),
          icon: const Icon(Icons.group_add_outlined),
          label: Text(AppLocalizations.of(context).dashJoinWithCode),
        ),
        const SizedBox(height: 10),
        OutlinedButton.icon(
          onPressed: () => context.push('/app/groups/create'),
          icon: const Icon(Icons.add_circle_outline_rounded),
          label: Text(AppLocalizations.of(context).createTontine),
        ),
      ],
    );
  }
}

/// Tableau de bord interactif : « Ce tour » (jauge de la collecte) ou « Tout
/// le cycle » (une barre par tour, à toucher pour voir son détail). Chiffres
/// du serveur, rien d'estimé.
class RoundsDashboard extends StatefulWidget {
  const RoundsDashboard({super.key, required this.rounds, required this.onOpen});
  final List<RoundProgress> rounds;
  final VoidCallback onOpen;

  @override
  State<RoundsDashboard> createState() => _RoundsDashboardState();
}

class _RoundsDashboardState extends State<RoundsDashboard> {
  bool _cycle = false;
  late int _selected = (widget.rounds.where((RoundProgress r) => r.open).firstOrNull ?? widget.rounds.last).seq;

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    final RoundProgress current = widget.rounds.where((RoundProgress r) => r.open).firstOrNull ?? widget.rounds.last;
    final RoundProgress shown = _cycle ? widget.rounds.firstWhere((RoundProgress r) => r.seq == _selected, orElse: () => current) : current;
    final int expected = widget.rounds.fold<int>(0, (int s, RoundProgress r) => s + r.expectedXaf);
    final int collected = widget.rounds.fold<int>(0, (int s, RoundProgress r) => s + r.collectedXaf);
    return KombeCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          SegmentedButton<bool>(
            showSelectedIcon: false,
            segments: <ButtonSegment<bool>>[
              ButtonSegment<bool>(value: false, label: Text(AppLocalizations.of(context).dashThisRound)),
              ButtonSegment<bool>(value: true, label: Text(AppLocalizations.of(context).dashWholeCycle)),
            ],
            selected: <bool>{_cycle},
            onSelectionChanged: (Set<bool> v) => setState(() => _cycle = v.first),
          ),
          const SizedBox(height: 14),
          if (!_cycle) ...<Widget>[
            Text('${(current.ratio * 100).round()} %', style: KombeType.display(size: 30).copyWith(color: KombeColors.brand)),
            Text(AppLocalizations.of(context).daRecusSur(Xaf.format(current.collectedXaf), Xaf.format(current.expectedXaf)), style: t.bodyMedium),
            const SizedBox(height: 10),
            ClipRRect(
              borderRadius: BorderRadius.circular(99),
              child: LinearProgressIndicator(minHeight: 10, value: current.ratio, color: KombeColors.brand, backgroundColor: KombeColors.sand),
            ),
            const SizedBox(height: 8),
            Text('${AppLocalizations.of(context).dashRoundDate(current.seq, _day(context, current.date))}${current.label != null ? ' · ${current.label}' : ''}', style: t.bodySmall),
          ] else ...<Widget>[
            Text(AppLocalizations.of(context).daCycleReceived(Xaf.format(collected), Xaf.format(expected)), style: t.bodyMedium),
            const SizedBox(height: 12),
            SizedBox(
              height: 110,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: <Widget>[
                  for (final RoundProgress r in widget.rounds)
                    Expanded(
                      child: Semantics(
                        button: true,
                        selected: r.seq == _selected,
                        label: AppLocalizations.of(context).dashRoundCollected(r.seq, (r.ratio * 100).round()),
                        child: GestureDetector(
                          onTap: () => setState(() => _selected = r.seq),
                          child: Container(
                            margin: const EdgeInsets.symmetric(horizontal: 2),
                            alignment: Alignment.bottomCenter,
                            decoration: BoxDecoration(color: KombeColors.cream, borderRadius: BorderRadius.circular(8)),
                            child: AnimatedContainer(
                              duration: const Duration(milliseconds: 400),
                              curve: Curves.easeOutCubic,
                              height: 110 * (r.ratio < 0.04 ? 0.04 : r.ratio),
                              decoration: BoxDecoration(
                                color: r.seq == _selected ? KombeColors.forest : r.open ? KombeColors.gold : KombeColors.mint,
                                borderRadius: BorderRadius.circular(8),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 10),
            Text('${AppLocalizations.of(context).dashRoundDate(shown.seq, _day(context, shown.date))}${shown.label != null ? ' · ${shown.label}' : ''}', style: t.titleSmall),
            Text(AppLocalizations.of(context).daRecusSur2(Xaf.format(shown.collectedXaf), Xaf.format(shown.expectedXaf)), style: t.bodySmall),
          ],
          Align(alignment: Alignment.centerRight, child: TextButton(onPressed: widget.onOpen, child: Text(AppLocalizations.of(context).dashSeeCycle))),
        ],
      ),
    );
  }
}
