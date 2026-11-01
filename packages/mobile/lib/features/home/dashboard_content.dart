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

/// Contenu de l'accueil. Emplacements STABLES, dans cet ordre :
/// 1. ma situation (à régler / à jour) et l'action principale ;
/// 2. « À faire » — règles simples et explicables : envoi à reprendre,
///    confirmations de ma fonction, vote ouvert ;
/// 3. prochaine séance ;
/// 4. activité récente du groupe (chaque ligne mène à l'action).
class HomeContent extends StatelessWidget {
  const HomeContent({super.key, required this.data, this.drafts = const <ContributionDraft>[], this.now});
  final HomeData data;
  final List<ContributionDraft> drafts;
  final DateTime? now;

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
      padding: const EdgeInsets.fromLTRB(0, 8, 0, 32),
      children: <Widget>[
        _Situation(data: data),
        if (todo.isNotEmpty) ...<Widget>[
          const _Title('À faire'),
          ...todo,
        ],
        if (data.nextMeetingDate != null) ...<Widget>[
          const _Title('Prochaine séance'),
          ListTile(
            leading: const Icon(Icons.event_outlined, color: KombeColors.forest),
            title: Text(toBeginningOfSentenceCase(_day(context, data.nextMeetingDate!))),
            subtitle: data.nextMeetingPlace == null ? null : Text(data.nextMeetingPlace!),
          ),
        ],
        _Title('Activité récente', action: TextButton(onPressed: () => context.go('/app/notifications'), child: const Text('Tout voir'))),
        if (data.recent.isEmpty)
          const Padding(
            padding: EdgeInsets.fromLTRB(20, 4, 20, 0),
            child: Text('Rien de nouveau dans ce groupe.'),
          ),
        for (final KombeNotification n in data.recent) NotificationTile(n: n, now: now, onTap: () => openNotification(context, n)),
      ],
    );
  }
}

/// Ma situation dans le groupe : montant à régler (ou « à jour ») et
/// l'action principale, puis ce qui attend confirmation.
class _Situation extends StatelessWidget {
  const _Situation({required this.data});
  final HomeData data;

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    final int due = data.remainingXaf;
    final String gid = Uri.encodeComponent(data.group.id);
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          if (due > 0) ...<Widget>[
            Text('À régler', style: t.labelLarge?.copyWith(color: KombeColors.slate)),
            const SizedBox(height: 2),
            Text(Xaf.format(due), style: t.displaySmall?.copyWith(fontWeight: FontWeight.w800, color: KombeColors.ink)),
            const SizedBox(height: 4),
            Text(
              data.late
                  ? 'En retard — à régler au plus vite'
                  : data.nextDueDate == null
                      ? 'Pour le tour en cours'
                      : 'Avant le ${_day(context, data.nextDueDate!)}',
              style: t.bodyMedium?.copyWith(color: data.late ? KombeColors.danger : KombeColors.slate, fontWeight: data.late ? FontWeight.w700 : null),
            ),
            const SizedBox(height: 14),
            FilledButton.icon(
              onPressed: () => context.push('/app/groups/$gid/contributions/new'),
              icon: const Icon(Icons.add_rounded),
              label: const Text('Déclarer un versement'),
            ),
          ] else
            Row(
              children: <Widget>[
                const Icon(Icons.check_circle_rounded, color: KombeColors.forest, size: 32),
                const SizedBox(width: 12),
                Expanded(child: Text('Vous êtes à jour dans ce groupe.', style: t.titleMedium)),
              ],
            ),
          if (data.pendingDeclarations > 0) ...<Widget>[
            const SizedBox(height: 12),
            InkWell(
              borderRadius: BorderRadius.circular(8),
              onTap: () => context.go('/app/contributions'),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Row(
                  children: <Widget>[
                    const Icon(Icons.hourglass_top_rounded, size: 18, color: KombeColors.goldDark),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        '${Xaf.format(data.pendingDeclaredXaf)} déclarés, en attente de confirmation par la trésorerie',
                        style: t.bodyMedium,
                      ),
                    ),
                    const Icon(Icons.chevron_right_rounded, size: 20),
                  ],
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _Title extends StatelessWidget {
  const _Title(this.text, {this.action});
  final String text;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.fromLTRB(20, 20, action == null ? 20 : 8, 4),
        child: Row(
          children: <Widget>[
            Expanded(child: Semantics(header: true, child: Text(text, style: Theme.of(context).textTheme.titleSmall?.copyWith(color: KombeColors.slate)))),
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
        minVerticalPadding: 12,
        leading: Icon(icon, color: tone),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
        subtitle: Text(subtitle),
        trailing: const Icon(Icons.chevron_right_rounded),
        onTap: onTap,
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
