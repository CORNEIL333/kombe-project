import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/design/kombe_ndop.dart';
import '../../core/design/kombe_theme.dart';
import '../../core/formatters/xaf.dart';
import '../../core/widgets/kombe_components.dart';
import '../../domain/entities/contribution.dart';
import '../../domain/entities/dashboard.dart';
import '../../domain/entities/group.dart';
import '../../domain/entities/notification.dart';
import '../notifications/notification_actions.dart';
import '../notifications/notifications_screen.dart';

String _day(BuildContext context, DateTime utc) =>
    DateFormat('EEEE d MMMM', Localizations.localeOf(context).toLanguageTag()).format(utc.toLocal());

/// Accueil « Ndop ». Emplacements STABLES, dans cet ordre :
/// héros indigo (salutation, reste à régler, échéance, action principale, à
/// confirmer, bande du cycle, lisière) ; raccourcis du groupe ; « À faire » (règles explicables : envoi à
/// reprendre, confirmations de ma fonction, vote ouvert) ; prochaine séance ;
/// activité récente du groupe. Aucune donnée inventée.
class HomeContent extends StatelessWidget {
  const HomeContent({super.key, required this.data, this.drafts = const <ContributionDraft>[], this.now, this.firstName});
  final HomeData data;
  final List<ContributionDraft> drafts;
  final DateTime? now;
  final String? firstName;

  @override
  Widget build(BuildContext context) {
    final String gid = Uri.encodeComponent(data.group.id);
    final List<Widget> todo = <Widget>[
      for (final ContributionDraft d in drafts)
        _TodoRow(
          icon: d.sending ? Icons.sync_problem_rounded : Icons.edit_note_rounded,
          tone: d.sending ? KombeTone.danger : KombeTone.brand,
          title: d.sending ? 'Envoi à reprendre' : 'Paiement à terminer',
          subtitle: '${Xaf.format(d.amountXaf)} · ${d.sending ? 'rien ne sera déclaré deux fois' : 'pas encore envoyé'}',
          onTap: () => context.push('/app/groups/$gid/contributions/new?draft=${Uri.encodeComponent(d.localId)}'),
        ),
      if (data.toValidate > 0)
        _TodoRow(
          icon: Icons.fact_check_outlined,
          tone: KombeTone.money,
          title: data.group.role == GroupRole.controller
              ? '${data.toValidate} paiement${data.toValidate > 1 ? 's' : ''} à contrôler'
              : '${data.toValidate} paiement${data.toValidate > 1 ? 's' : ''} à confirmer',
          subtitle: 'Bureau',
          onTap: () => context.push('/app/validations'),
        ),
      for (final PendingVote v in data.votes)
        _TodoRow(
          icon: Icons.how_to_vote_outlined,
          tone: KombeTone.info,
          title: 'Vote : ${v.title}',
          subtitle: 'Jusqu’au ${_day(context, v.closesAtUtc)}',
          onTap: () => context.push('/app/votes/${Uri.encodeComponent(v.id)}'),
        ),
    ];
    final GroupSummary g = data.group;
    return ListView(
      padding: const EdgeInsets.only(bottom: 32),
      children: <Widget>[
        _Hero(data: data, firstName: firstName),
        // Raccourcis du groupe : quatre entrées, toujours au même endroit.
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 18, 12, 0),
          child: Row(
            children: <Widget>[
              _Shortcut(icon: Icons.donut_large_rounded, label: 'Cycle', onTap: () => context.push('/app/groups/$gid/cycle')),
              _Shortcut(icon: Icons.groups_2_outlined, label: 'Membres', onTap: () => context.push('/app/groups/$gid/members')),
              _Shortcut(icon: Icons.account_balance_wallet_outlined, label: 'Caisses', onTap: () => context.push('/app/groups/$gid/funds')),
              _Shortcut(icon: Icons.menu_book_outlined, label: 'Règles', onTap: () => context.push('/app/groups/$gid/rules')),
            ],
          ),
        ),
        if (todo.isNotEmpty) ...<Widget>[
          KombeSection('À faire', action: 'Tout voir', onAction: () => context.go('/app/notifications')),
          KombeGroupedList(children: todo),
        ],
        if (data.nextMeetingDate != null) ...<Widget>[
          const KombeSection('Prochaine séance'),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: _MeetingCard(date: data.nextMeetingDate!, place: data.nextMeetingPlace, group: g.name, onTap: () => context.push('/app/groups/$gid')),
          ),
        ],
        KombeSection('Activité récente', action: data.recent.isEmpty ? null : 'Historique', onAction: () => context.go('/app/notifications')),
        if (data.recent.isEmpty)
          const Padding(
            padding: EdgeInsets.fromLTRB(20, 0, 20, 0),
            child: Text('Rien de nouveau.'),
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
/// « à jour »), une action, puis la bande du cycle et la lisière.
class _Hero extends StatelessWidget {
  const _Hero({required this.data, this.firstName});
  final HomeData data;
  final String? firstName;

  @override
  Widget build(BuildContext context) {
    final int due = data.remainingXaf;
    final String gid = Uri.encodeComponent(data.group.id);
    final TextStyle soft = TextStyle(color: Colors.white.withValues(alpha: .82), fontSize: 15, height: 1.35, fontWeight: FontWeight.w600);
    const Color alert = Color(0xFFFFB4A6);
    final bool cycle = data.group.cycleTotal > 0 && data.group.cycleIndex > 0;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        NdopSurface(
          variant: 0,
          opacity: .2,
          tile: 34,
          fadeTo: Alignment.centerLeft,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 6, 20, 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                Text(firstName == null ? 'Bonjour' : 'Bonjour $firstName', style: soft),
                const SizedBox(height: 18),
                if (due > 0) ...<Widget>[
                  Text('À régler', style: KombeType.eyebrow.copyWith(color: KombeColors.goldLight, fontSize: 13)),
                  const SizedBox(height: 4),
                  FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: Alignment.centerLeft,
                    child: KombeAmount(due, size: 54, color: Colors.white),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    data.late
                        ? 'En retard'
                        : data.nextDueDate == null
                            ? 'Pour ce tour'
                            : 'Avant le ${_day(context, data.nextDueDate!)}',
                    style: soft.copyWith(color: data.late ? alert : null, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 18),
                  FilledButton.icon(
                    style: FilledButton.styleFrom(backgroundColor: KombeColors.goldWarm, foregroundColor: KombeColors.ink, minimumSize: const Size.fromHeight(56)),
                    onPressed: () => context.push('/app/groups/$gid/contributions/new'),
                    icon: const Icon(Icons.check_rounded),
                    label: const Text('J’ai payé'),
                  ),
                ] else ...<Widget>[
                  Text('Vous êtes à jour', style: KombeType.display(size: 38, color: Colors.white)),
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
                            const Icon(Icons.hourglass_top_rounded, size: 18, color: KombeColors.goldLight),
                            const SizedBox(width: 8),
                            Expanded(child: Text('${Xaf.format(data.pendingDeclaredXaf)} à confirmer', style: soft)),
                            Icon(Icons.chevron_right_rounded, size: 20, color: Colors.white.withValues(alpha: .7)),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
                if (cycle) ...<Widget>[
                  const SizedBox(height: 14),
                  KombeCycleBand(index: data.group.cycleIndex, total: data.group.cycleTotal, onDark: true),
                  const SizedBox(height: 8),
                  Text('Tour ${data.group.cycleIndex} sur ${data.group.cycleTotal}', style: soft.copyWith(fontSize: 14)),
                ],
              ],
            ),
          ),
        ),
        KombeSelvedge(alert: data.late),
      ],
    );
  }
}

/// Raccourci : picto sur coupe de tissu, libellé dessous.
class _Shortcut extends StatelessWidget {
  const _Shortcut({required this.icon, required this.label, required this.onTap});
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
                    decoration: const ShapeDecoration(color: KombeColors.mint, shape: KombeTheme.cut),
                    child: Icon(icon, color: KombeColors.forest, size: 24),
                  ),
                  const SizedBox(height: 6),
                  Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: KombeColors.ink)),
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
        label: 'Chargement',
        child: ListView(
          physics: const NeverScrollableScrollPhysics(),
          children: <Widget>[
            Container(height: 320, color: KombeColors.forest),
            const KombeSelvedge(),
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
        Text('Bienvenue sur KÓMBE', style: t.headlineMedium, textAlign: TextAlign.center),
        const SizedBox(height: 10),
        const Text(
          'KÓMBE tient le registre de votre tontine : cotisations, tours, séances. '
          'L’argent, lui, reste entre vos mains.',
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 28),
        FilledButton.icon(
          onPressed: () => context.push('/app/groups/join'),
          icon: const Icon(Icons.group_add_outlined),
          label: const Text('Rejoindre avec un code'),
        ),
        const SizedBox(height: 10),
        OutlinedButton.icon(
          onPressed: () => context.push('/app/groups/create'),
          icon: const Icon(Icons.add_circle_outline_rounded),
          label: const Text('Créer une tontine'),
        ),
      ],
    );
  }
}
