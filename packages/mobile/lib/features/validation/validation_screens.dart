import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import 'package:intl/intl.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/formatters/xaf.dart';
import '../../core/state/operation_result.dart';
import '../../core/state/resource.dart';
import '../../core/widgets/african_pattern_band.dart';
import '../../core/widgets/kombe_logo.dart';
import '../../core/widgets/kombe_visuals.dart';
import '../../core/widgets/screen_states.dart';
import '../../core/widgets/server_action_guard.dart';
import '../../core/widgets/section_card.dart';
import '../../domain/entities/governance.dart';
import '../../domain/repositories/governance_repository.dart';

class ValidationQueueScreen extends StatefulWidget {
  const ValidationQueueScreen({super.key});

  @override
  State<ValidationQueueScreen> createState() => _ValidationQueueScreenState();
}

class _ValidationQueueScreenState extends State<ValidationQueueScreen> {
  Resource<List<ValidationItem>> _state =
      const ResourceLoading<List<ValidationItem>>();

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _load();
  }

  Future<void> _load() async {
    final Resource<List<ValidationItem>> state =
        await context.read<GovernanceRepository>().listPendingValidations();
    if (mounted) setState(() => _state = state);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Validations')),
        body: ResourceView<List<ValidationItem>>(
          resource: _state,
          emptyWhen: (List<ValidationItem> data) => data.isEmpty,
          builder: (BuildContext context, List<ValidationItem> data) =>
              ListView.separated(
            padding: const EdgeInsets.all(20),
            itemCount: data.length,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (BuildContext context, int index) {
              final ValidationItem item = data[index];
              return SectionCard(
                child: ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const CircleAvatar(child: Icon(Icons.fact_check_outlined)),
                  title: Text(item.memberDisplayName),
                  subtitle: Text(Xaf.format(item.amountXaf)),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.push(
                    '/app/validations/${item.contributionId}',
                  ),
                ),
              );
            },
          ),
        ),
      );
}

class ValidationDetailScreen extends StatefulWidget {
  const ValidationDetailScreen({
    required this.contributionId,
    super.key,
  });

  final String contributionId;

  @override
  State<ValidationDetailScreen> createState() => _ValidationDetailScreenState();
}

class _ValidationDetailScreenState extends State<ValidationDetailScreen> {
  Resource<ValidationItem> _state = const ResourceLoading<ValidationItem>();

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _load();
  }

  Future<void> _load() async {
    final Resource<ValidationItem> state =
        await context.read<GovernanceRepository>().getValidation(
              widget.contributionId,
            );
    if (mounted) setState(() => _state = state);
  }

  Future<void> _decide(
    ValidationItem item,
    ValidationDecision decision,
  ) async {
    final OperationResult<void> result =
        await context.read<GovernanceRepository>().decideValidation(
              contributionId: item.contributionId,
              expectedVersion: item.version,
              decision: decision,
            );
    if (!mounted) return;
    switch (result) {
      case OperationSuccess<void>():
        // Confirmé par le serveur uniquement : retour haptique et message proportionnés.
        unawaited(HapticFeedback.mediumImpact());
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Décision enregistrée dans l’historique du groupe.')),
        );
        await _load();
      case OperationBlocked<void>():
        await showServerAuthorityRequired(context);
      case OperationFailure<void>(:final error):
        unawaited(HapticFeedback.heavyImpact());
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(error.toString())),
        );
    }
  }

  ValidationDecision? _choice;
  bool _sending = false;

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    final String locale = Localizations.localeOf(context).toLanguageTag();
    return Scaffold(
      appBar: AppBar(centerTitle: true, title: const KombeLogo(size: 38)),
      body: ResourceView<ValidationItem>(
        resource: _state,
        builder: (BuildContext context, ValidationItem item) => Column(
          children: <Widget>[
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 4, 20, 16),
                children: <Widget>[
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(color: KombeColors.sand, borderRadius: BorderRadius.circular(20)),
                    child: Row(
                      children: <Widget>[
                        Container(
                          width: 64,
                          height: 64,
                          decoration: BoxDecoration(color: KombeColors.gold.withValues(alpha: .22), shape: BoxShape.circle),
                          child: const Icon(Icons.assignment_rounded, color: KombeColors.goldDark, size: 32),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: <Widget>[
                              Text('Validation de cotisation', style: t.titleLarge?.copyWith(fontSize: 19)),
                              const SizedBox(height: 4),
                              Text('Vérifiez la déclaration du membre avant de décider.', style: t.bodyMedium),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 14),
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20), border: Border.all(color: KombeColors.line)),
                    child: Column(
                      children: <Widget>[
                        Row(
                          children: <Widget>[
                            KombeAvatar(name: item.memberDisplayName, size: 64),
                            const SizedBox(width: 14),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: <Widget>[
                                  Text(item.memberDisplayName, style: t.titleLarge?.copyWith(fontSize: 19)),
                                  const SizedBox(height: 6),
                                  const KombeChip(label: 'Déclaration soumise'),
                                ],
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        _Fact(icon: Icons.timer_outlined, label: 'Montant déclaré', value: Xaf.format(item.amountXaf), strong: true),
                        _Fact(
                          icon: Icons.calendar_month_outlined,
                          label: 'Date de déclaration',
                          value: DateFormat.yMMMd(locale).add_Hm().format(item.declaredAtUtc.toLocal()),
                        ),
                        _Fact(icon: Icons.description_outlined, label: 'Preuve de paiement', value: item.evidenceName ?? 'Non fournie', last: true),
                      ],
                    ),
                  ),
                  const SizedBox(height: 22),
                  Text('Votre décision', style: t.titleLarge),
                  const SizedBox(height: 4),
                  Text('Choisissez une option, puis confirmez.', style: t.bodyMedium),
                  const SizedBox(height: 12),
                  for (final (ValidationDecision d, IconData icon, String title, String hint) in <(ValidationDecision, IconData, String, String)>[
                    (ValidationDecision.validate, Icons.check_rounded, 'Valider la cotisation', 'Confirme que le membre a bien payé.'),
                    (ValidationDecision.reject, Icons.close_rounded, 'Rejeter la cotisation', 'Il manque une preuve ou le montant est incorrect.'),
                    (ValidationDecision.requestInformation, Icons.schedule_rounded, 'Demander plus d’informations', 'Poser une question au membre.'),
                  ])
                    _DecisionOption(
                      icon: icon,
                      title: title,
                      hint: hint,
                      selected: _choice == d,
                      onTap: () => setState(() => _choice = d),
                    ),
                  const SizedBox(height: 8),
                  FilledButton(
                    onPressed: _choice == null || _sending
                        ? null
                        : () async {
                            setState(() => _sending = true);
                            await _decide(item, _choice!);
                            if (mounted) setState(() => _sending = false);
                          },
                    child: _sending
                        ? const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: <Widget>[Text('Confirmer ma décision'), SizedBox(width: 10), Icon(Icons.arrow_forward_rounded)],
                          ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'Votre décision est enregistrée dans l’historique du groupe uniquement après acceptation du serveur.',
                    style: t.bodySmall,
                  ),
                ],
              ),
            ),
            const AfricanPatternBand(height: 36),
          ],
        ),
      ),
    );
  }
}

class _Fact extends StatelessWidget {
  const _Fact({required this.icon, required this.label, required this.value, this.strong = false, this.last = false});
  final IconData icon;
  final String label;
  final String value;
  final bool strong;
  final bool last;

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 13),
      decoration: BoxDecoration(border: last ? null : const Border(bottom: BorderSide(color: KombeColors.line))),
      child: Row(
        children: <Widget>[
          Icon(icon, color: KombeColors.slate, size: 22),
          const SizedBox(width: 12),
          Expanded(child: Text(label, style: t.bodyMedium)),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.end,
              overflow: TextOverflow.ellipsis,
              style: (strong ? t.titleMedium : t.bodyMedium)?.copyWith(color: KombeColors.ink),
            ),
          ),
        ],
      ),
    );
  }
}

class _DecisionOption extends StatelessWidget {
  const _DecisionOption({required this.icon, required this.title, required this.hint, required this.selected, required this.onTap});
  final IconData icon;
  final String title;
  final String hint;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Semantics(
        inMutuallyExclusiveGroup: true,
        checked: selected,
        button: true,
        label: '$title. $hint',
        child: ExcludeSemantics(
          child: InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: onTap,
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 150),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: selected ? KombeColors.mint : Colors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: selected ? KombeColors.forest : KombeColors.line, width: selected ? 2 : 1),
              ),
              child: Row(
                children: <Widget>[
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: selected ? KombeColors.forest : Colors.white,
                      border: Border.all(color: selected ? Colors.transparent : KombeColors.lineStrong, width: 1.5),
                    ),
                    child: Icon(icon, color: selected ? Colors.white : KombeColors.ink, size: 22),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Text(title, style: t.titleSmall?.copyWith(fontSize: 15)),
                        const SizedBox(height: 2),
                        Text(hint, style: t.bodySmall),
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
}
