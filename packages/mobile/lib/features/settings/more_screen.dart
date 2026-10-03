import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/widgets/list_row.dart';
import '../../core/widgets/section_card.dart';

class MoreScreen extends StatelessWidget {
  const MoreScreen({super.key});

  @override
  Widget build(BuildContext context) => ListView(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 100),
        children: <Widget>[
          Text('Plus', style: Theme.of(context).textTheme.headlineLarge),
          const SizedBox(height: 16),
          SectionCard(
            child: Column(
              children: <Widget>[
                KombeListRow(
                  icon: Icons.person_outline,
                  title: 'Profil',
                  onTap: () => context.push('/app/profile'),
                ),
                const Divider(),
                KombeListRow(
                  icon: Icons.payments_outlined,
                  title: 'Cotisations',
                  onTap: () => context.push('/app/contributions'),
                ),
                const Divider(),
                KombeListRow(
                  icon: Icons.verified_outlined,
                  title: 'Validations',
                  onTap: () => context.push('/app/validations'),
                ),
                const Divider(),
                KombeListRow(
                  icon: Icons.how_to_vote_outlined,
                  title: 'Votes',
                  onTap: () => context.push('/app/votes'),
                ),
                const Divider(),
                KombeListRow(
                  icon: Icons.gavel_outlined,
                  title: 'Litiges',
                  onTap: () => context.push('/app/disputes'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          SectionCard(
            child: Column(
              children: <Widget>[
                KombeListRow(
                  icon: Icons.description_outlined,
                  title: 'Documents',
                  onTap: () => context.push('/app/documents'),
                ),
                const Divider(),
                KombeListRow(
                  icon: Icons.download_outlined,
                  title: 'Exports',
                  onTap: () => context.push('/app/exports'),
                ),
                const Divider(),
                KombeListRow(
                  icon: Icons.offline_bolt_outlined,
                  title: 'État hors connexion',
                  onTap: () => context.push('/app/offline'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          SectionCard(
            child: Column(
              children: <Widget>[
                KombeListRow(
                  icon: Icons.help_outline,
                  title: 'Centre d’aide',
                  onTap: () => context.push('/app/help'),
                ),
                const Divider(),
                KombeListRow(
                  icon: Icons.info_outline,
                  title: 'À propos',
                  onTap: () => context.push('/app/about'),
                ),
              ],
            ),
          ),
        ],
      );
}
