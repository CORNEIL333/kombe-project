import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/formatters/xaf.dart';
import '../../domain/entities/contribution.dart';
import '../../domain/entities/dashboard.dart';
import '../../domain/entities/group.dart';
import '../../domain/entities/notification.dart';
import '../notifications/notification_actions.dart';
import '../notifications/notifications_screen.dart';

String _day(BuildContext context, DateTime utc) =>
    DateFormat('EEEE d MMMM', Localizations.localeOf(context).toLanguageTag()).format(utc.toLocal());

/// Accueil (planche de référence). Emplacements STABLES, dans cet ordre :
/// bandeau forêt (salutation, marque) ; carte ivoire « À régler » et action
/// principale ; déclaré en attente ; « À faire » (règles explicables : envoi à
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
          tone: d.sending ? KombeColors.danger : KombeColors.forest,
          title: d.sending ? 'Envoi à reprendre' : 'Brouillon de déclaration',
          subtitle: '${Xaf.format(d.amountXaf)} · ${d.sending ? 'rien ne sera déclaré deux fois' : 'pas encore envoyé'}',
          onTap: () => context.push('/app/groups/$gid/contributions/new?draft=${Uri.encodeComponent(d.localId)}'),
        ),
      if (data.toValidate > 0)
        _TodoRow(
          icon: Icons.fact_check_outlined,
          title: data.group.role == GroupRole.controller
              ? '${data.toValidate} paiement${data.toValidate > 1 ? 's' : ''} à contrôler'
              : '${data.toValidate} déclaration${data.toValidate > 1 ? 's' : ''} à confirmer',
          subtitle: 'Votre fonction au bureau',
          onTap: () => context.push('/app/validations'),
        ),
      for (final PendingVote v in data.votes)
        _TodoRow(
          icon: Icons.how_to_vote_outlined,
          title: 'Vote : ${v.title}',
          subtitle: 'Jusqu’au ${_day(context, v.closesAtUtc)}',
          onTap: () => context.push('/app/votes/${Uri.encodeComponent(v.id)}'),
        ),
    ];
    return ListView(
      padding: const EdgeInsets.only(bottom: 28),
      children: <Widget>[
        Stack(
          clipBehavior: Clip.none,
          children: <Widget>[
            _Greeting(firstName: firstName),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 124, 16, 0),
              child: _DueCard(data: data),
            ),
          ],
        ),
        if (data.pendingDeclarations > 0)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: _SoftRow(
              icon: Icons.hourglass_top_rounded,
              text: '${Xaf.format(data.pendingDeclaredXaf)} déclarés, en attente de confirmation par la trésorerie',
              onTap: () => context.go('/app/contributions'),
            ),
          ),
        if (todo.isNotEmpty) ...<Widget>[
          _Title('À faire', action: TextButton(onPressed: () => context.go('/app/notifications'), child: const Text('Tout voir'))),
          ...todo,
        ],
        if (data.nextMeetingDate != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: _MeetingCard(date: data.nextMeetingDate!, place: data.nextMeetingPlace, onTap: () => context.push('/app/groups/$gid')),
          ),
        const _Title('Activité récente'),
        if (data.recent.isEmpty)
          const Padding(padding: EdgeInsets.fromLTRB(20, 0, 20, 0), child: Text('Rien de nouveau dans ce groupe.')),
        for (final KombeNotification n in data.recent) NotificationTile(n: n, now: now, onTap: () => openNotification(context, n)),
      ],
    );
  }
}

/// Bandeau forêt sous la barre : salutation, marque, signature ; vannerie à droite.
class _Greeting extends StatelessWidget {
  const _Greeting({this.firstName});
  final String? firstName;

  @override
  Widget build(BuildContext context) => SizedBox(
        height: 196,
        child: Stack(
          fit: StackFit.expand,
          children: <Widget>[
            const ColoredBox(color: KombeColors.forest),
            const ExcludeSemantics(
              child: Align(
                alignment: Alignment.centerRight,
                child: Image(image: AssetImage('assets/images/fonds/creation.webp'), fit: BoxFit.fitHeight, height: 196),
              ),
            ),
            const DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(colors: <Color>[KombeColors.forest, Color(0x00103C32)], stops: <double>[.42, .95]),
              ),
            ),
            Padding(padding: const EdgeInsets.fromLTRB(20, 6, 20, 0), child: _GreetingText(firstName: firstName)),
          ],
        ),
      );
}

/// Texte du bandeau, posé au-dessus du dégradé (le dégradé ne voile pas le texte).
class _GreetingText extends StatelessWidget {
  const _GreetingText({this.firstName});
  final String? firstName;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(firstName == null ? 'Bonjour 👋' : 'Bonjour $firstName 👋',
              style: const TextStyle(color: KombeColors.cream, fontSize: 14, fontWeight: FontWeight.w600)),
          const SizedBox(height: 2),
          const Text('KÓMBE', style: TextStyle(color: KombeColors.cream, fontSize: 30, fontWeight: FontWeight.w800, height: 1.1)),
          const SizedBox(height: 2),
          Text('Votre tontine, en toute confiance.', style: TextStyle(color: KombeColors.cream.withValues(alpha: .86), fontSize: 13)),
        ],
      );
}

/// Carte ivoire « À régler » : montant réel, échéance, action principale.
class _DueCard extends StatelessWidget {
  const _DueCard({required this.data});
  final HomeData data;

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    final int due = data.remainingXaf;
    final String gid = Uri.encodeComponent(data.group.id);
    return Container(
            padding: const EdgeInsets.fromLTRB(20, 18, 20, 18),
            decoration: BoxDecoration(
              color: const Color(0xFFFFFDF8),
              borderRadius: BorderRadius.circular(24),
              boxShadow: const <BoxShadow>[BoxShadow(color: Color(0x2E103C32), blurRadius: 30, offset: Offset(0, 12), spreadRadius: -10)],
            ),
            child: Stack(
              children: <Widget>[
                if (due > 0)
                  const Positioned(
                    right: 0,
                    top: 0,
                    child: _Coins(),
                  ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    if (due > 0) ...<Widget>[
                      Text('À régler', style: t.bodyMedium?.copyWith(color: KombeColors.slate)),
                      const SizedBox(height: 2),
                      Text(Xaf.format(due),
                          style: const TextStyle(color: KombeColors.forest, fontSize: 32, fontWeight: FontWeight.w800, height: 1.1, letterSpacing: -.8)),
                      const SizedBox(height: 4),
                      Text(
                        data.late
                            ? 'En retard — à régler au plus vite'
                            : data.nextDueDate == null
                                ? 'Pour le tour en cours'
                                : 'Avant le ${_day(context, data.nextDueDate!)}.',
                        style: t.bodyMedium?.copyWith(
                          color: data.late ? KombeColors.danger : KombeColors.slate,
                          fontWeight: data.late ? FontWeight.w700 : null,
                        ),
                      ),
                      const SizedBox(height: 16),
                      SizedBox(
                        width: double.infinity,
                        child: FilledButton.icon(
                          style: FilledButton.styleFrom(
                            backgroundColor: KombeColors.forest,
                            foregroundColor: KombeColors.cream,
                            minimumSize: const Size.fromHeight(52),
                            shape: const StadiumBorder(),
                            textStyle: const TextStyle(fontFamily: 'Manrope', fontWeight: FontWeight.w800, fontSize: 16),
                          ),
                          onPressed: () => context.push('/app/groups/$gid/contributions/new'),
                          icon: const Icon(Icons.add_rounded),
                          label: const Text('Déclarer un versement'),
                        ),
                      ),
                    ] else
                      Row(
                        children: <Widget>[
                          const Icon(Icons.check_circle_rounded, color: KombeColors.jade, size: 30),
                          const SizedBox(width: 12),
                          Expanded(child: Text('Vous êtes à jour dans ce groupe.', style: t.titleMedium)),
                        ],
                      ),
                  ],
                ),
              ],
            ),
          );
  }
}

/// Pièces d'or (cercle doré, motif de la carte « À régler »).
class _Coins extends StatelessWidget {
  const _Coins();

  @override
  Widget build(BuildContext context) => ExcludeSemantics(
        child: Container(
          width: 64,
          height: 64,
          decoration: const BoxDecoration(
            shape: BoxShape.circle,
            gradient: RadialGradient(center: Alignment(-.3, -.4), colors: <Color>[Color(0xFFF3D48F), KombeColors.goldWarm]),
            boxShadow: <BoxShadow>[BoxShadow(color: Color(0x66C99439), blurRadius: 18, offset: Offset(0, 8), spreadRadius: -6)],
          ),
          child: const Icon(Icons.savings_outlined, color: Color(0xFF6B4A0E), size: 30),
        ),
      );
}

class _SoftRow extends StatelessWidget {
  const _SoftRow({required this.icon, required this.text, required this.onTap});
  final IconData icon;
  final String text;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
        color: const Color(0xFFFFFDF8),
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            child: Row(
              children: <Widget>[
                Icon(icon, color: KombeColors.goldWarm, size: 22),
                const SizedBox(width: 12),
                Expanded(child: Text(text, style: Theme.of(context).textTheme.bodyMedium)),
                const Icon(Icons.chevron_right_rounded),
              ],
            ),
          ),
        ),
      );
}

/// Prochaine séance : carte forêt au motif tissé.
class _MeetingCard extends StatelessWidget {
  const _MeetingCard({required this.date, required this.place, required this.onTap});
  final DateTime date;
  final String? place;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
        button: true,
        child: Material(
          color: KombeColors.forest,
          borderRadius: BorderRadius.circular(22),
          clipBehavior: Clip.antiAlias,
          child: Ink(
            decoration: const BoxDecoration(
              image: DecorationImage(
                image: AssetImage('assets/images/fonds/creation.webp'),
                fit: BoxFit.fitHeight,
                alignment: Alignment.centerRight,
                opacity: .55,
              ),
            ),
            child: InkWell(
              onTap: onTap,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: <Widget>[
                    Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(color: Colors.white.withValues(alpha: .14), borderRadius: BorderRadius.circular(14)),
                      child: const Icon(Icons.calendar_month_outlined, color: KombeColors.goldWarm),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          Text('Prochaine séance', style: TextStyle(color: KombeColors.cream.withValues(alpha: .8), fontSize: 12.5)),
                          Text(toBeginningOfSentenceCase(_day(context, date)),
                              style: const TextStyle(color: KombeColors.cream, fontSize: 19, fontWeight: FontWeight.w800)),
                          if (place != null)
                            Row(
                              children: <Widget>[
                                const Icon(Icons.place_outlined, size: 15, color: KombeColors.cream),
                                const SizedBox(width: 4),
                                Flexible(child: Text(place!, style: const TextStyle(color: KombeColors.cream, fontSize: 13), overflow: TextOverflow.ellipsis)),
                              ],
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
}

class _Title extends StatelessWidget {
  const _Title(this.text, {this.action});
  final String text;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.fromLTRB(20, 18, action == null ? 20 : 8, 2),
        child: Row(
          children: <Widget>[
            Expanded(
              child: Semantics(
                header: true,
                child: Text(text, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: KombeColors.ink)),
              ),
            ),
            if (action != null) action!,
          ],
        ),
      );
}

class _TodoRow extends StatelessWidget {
  const _TodoRow({required this.icon, required this.title, required this.subtitle, required this.onTap, this.tone = KombeColors.forest});
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final Color tone;

  @override
  Widget build(BuildContext context) => ListTile(
        minVerticalPadding: 10,
        leading: Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(color: KombeColors.mint, borderRadius: BorderRadius.circular(12)),
          child: Icon(icon, color: tone, size: 22),
        ),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
        subtitle: Text(subtitle),
        trailing: const Icon(Icons.chevron_right_rounded),
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
            Container(height: 196, color: KombeColors.forest),
            Transform.translate(
              offset: const Offset(0, -64),
              child: Column(
                children: <Widget>[
                  _bone(height: 190, radius: 24),
                  _bone(height: 56),
                  _bone(height: 56),
                  _bone(height: 80, radius: 22),
                ],
              ),
            ),
          ],
        ),
      );

  Widget _bone({required double height, double radius = 16}) => Container(
        height: height,
        margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
        decoration: BoxDecoration(color: const Color(0xFFEFE8DA), borderRadius: BorderRadius.circular(radius)),
      );
}

/// Aucun groupe : rejoindre (code reçu du bureau) ou créer.
class NoGroupHome extends StatelessWidget {
  const NoGroupHome({super.key});

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    return ListView(
      padding: const EdgeInsets.all(24),
      children: <Widget>[
        const SizedBox(height: 24),
        Text('Bienvenue sur KÓMBE', style: t.headlineSmall),
        const SizedBox(height: 8),
        const Text(
          'KÓMBE tient le registre de votre tontine : cotisations, tours, séances. '
          'L’argent, lui, reste entre vos mains.',
        ),
        const SizedBox(height: 24),
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
