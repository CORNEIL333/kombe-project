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

/// Accueil « Cercle & Ndop ». Emplacements STABLES, dans cet ordre :
/// héros forêt (salutation, reste à régler, échéance, anneau du cycle, action
/// principale, déclaré en attente) ; raccourcis du groupe ; « À faire » (règles explicables : envoi à
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
          title: d.sending ? 'Envoi à reprendre' : 'Brouillon de déclaration',
          subtitle: '${Xaf.format(d.amountXaf)} · ${d.sending ? 'rien ne sera déclaré deux fois' : 'pas encore envoyé'}',
          onTap: () => context.push('/app/groups/$gid/contributions/new?draft=${Uri.encodeComponent(d.localId)}'),
        ),
      if (data.toValidate > 0)
        _TodoRow(
          icon: Icons.fact_check_outlined,
          tone: KombeTone.money,
          title: data.group.role == GroupRole.controller
              ? '${data.toValidate} paiement${data.toValidate > 1 ? 's' : ''} à contrôler'
              : '${data.toValidate} déclaration${data.toValidate > 1 ? 's' : ''} à confirmer',
          subtitle: 'Votre fonction au bureau',
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
              _Shortcut(icon: Icons.menu_book_outlined, label: 'Statuts', onTap: () => context.push('/app/groups/$gid/rules')),
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
            child: Text('Rien de nouveau dans ce groupe pour l’instant.'),
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

/// Héros de l'accueil : prolonge la barre forêt. Salutation, ce qui reste à
/// régler (Fraunces), échéance, anneau du cycle, action principale, déclaré
/// en attente. Motif Ndop effacé côté texte : la lecture reste nette.
class _Hero extends StatelessWidget {
  const _Hero({required this.data, this.firstName});
  final HomeData data;
  final String? firstName;

  @override
  Widget build(BuildContext context) {
    final int due = data.remainingXaf;
    final String gid = Uri.encodeComponent(data.group.id);
    final TextStyle soft = TextStyle(color: KombeColors.cream.withValues(alpha: .78), fontSize: 14, height: 1.35);
    const Color alert = Color(0xFFFFB4A6);
    return NdopSurface(
      variant: 0,
      opacity: .11,
      tile: 30,
      fadeTo: Alignment.centerLeft,
      borderRadius: const BorderRadius.vertical(bottom: Radius.circular(32)),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 22),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Text(firstName == null ? 'Bonjour' : 'Bonjour $firstName', style: soft.copyWith(fontWeight: FontWeight.w600)),
            const SizedBox(height: 14),
            Row(
              children: <Widget>[
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text(due > 0 ? 'À régler' : 'Ce tour', style: KombeType.eyebrow.copyWith(color: KombeColors.goldLight)),
                      const SizedBox(height: 6),
                      if (due > 0)
                        FittedBox(
                          fit: BoxFit.scaleDown,
                          alignment: Alignment.centerLeft,
                          child: KombeAmount(due, size: 38, color: KombeColors.cream),
                        )
                      else
                        Text('Vous êtes à jour', style: KombeType.display(size: 28, color: KombeColors.cream)),
                      const SizedBox(height: 6),
                      if (due > 0)
                        Row(
                          children: <Widget>[
                            Icon(data.late ? Icons.error_outline_rounded : Icons.event_outlined, size: 16, color: data.late ? alert : KombeColors.cream.withValues(alpha: .78)),
                            const SizedBox(width: 6),
                            Flexible(
                              child: Text(
                                data.late
                                    ? 'En retard — à régler au plus vite'
                                    : data.nextDueDate == null
                                        ? 'Pour le tour en cours'
                                        : 'Avant le ${_day(context, data.nextDueDate!)}',
                                style: soft.copyWith(color: data.late ? alert : null, fontWeight: data.late ? FontWeight.w700 : null),
                              ),
                            ),
                          ],
                        )
                      else
                        Text('Rien à régler dans ce groupe.', style: soft),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                KombeCycleRing(index: data.group.cycleIndex, total: data.group.cycleTotal, size: 86, onDark: true),
              ],
            ),
            const SizedBox(height: 20),
            if (due > 0)
              FilledButton.icon(
                style: FilledButton.styleFrom(backgroundColor: KombeColors.cream, foregroundColor: KombeColors.forest),
                onPressed: () => context.push('/app/groups/$gid/contributions/new'),
                icon: const Icon(Icons.add_rounded),
                label: const Text('Déclarer un versement'),
              )
            else
              OutlinedButton.icon(
                style: OutlinedButton.styleFrom(
                  backgroundColor: Colors.transparent,
                  foregroundColor: KombeColors.cream,
                  side: BorderSide(color: KombeColors.cream.withValues(alpha: .4)),
                ),
                onPressed: () => context.go('/app/contributions'),
                icon: const Icon(Icons.receipt_long_outlined),
                label: const Text('Voir mes cotisations'),
              ),
            if (data.pendingDeclarations > 0) ...<Widget>[
              const SizedBox(height: 12),
              Material(
                color: const Color(0x1AFBF8F1),
                shape: const StadiumBorder(),
                clipBehavior: Clip.antiAlias,
                child: InkWell(
                  onTap: () => context.go('/app/contributions'),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    child: Row(
                      children: <Widget>[
                        const Icon(Icons.hourglass_top_rounded, size: 18, color: KombeColors.goldLight),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            '${Xaf.format(data.pendingDeclaredXaf)} déclarés · en attente de la trésorerie',
                            style: const TextStyle(color: KombeColors.cream, fontSize: 13.5, fontWeight: FontWeight.w600),
                          ),
                        ),
                        Icon(Icons.chevron_right_rounded, size: 20, color: KombeColors.cream.withValues(alpha: .7)),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Raccourci rond : picto sur fond blanc cerclé, libellé dessous.
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
                    decoration: BoxDecoration(color: Colors.white, shape: BoxShape.circle, border: Border.all(color: KombeColors.line)),
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
            Container(
              height: 250,
              decoration: const BoxDecoration(color: KombeColors.forest, borderRadius: BorderRadius.vertical(bottom: Radius.circular(32))),
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
