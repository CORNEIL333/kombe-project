import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/design/kombe_theme.dart';
import '../../core/formatters/xaf.dart';
import '../../core/state/operation_result.dart';
import '../../core/state/resource.dart';
import '../../core/widgets/kombe_components.dart';
import '../../core/widgets/kombe_sheet.dart';
import '../../core/widgets/group_avatar.dart';
import '../../core/widgets/screen_states.dart';
import '../../domain/entities/governance.dart';
import '../../domain/repositories/governance_repository.dart';

/// Libellés selon la responsabilité : la trésorerie CONFIRME qu'elle a
/// retrouvé le paiement ; le commissaire aux comptes CONTRÔLE ensuite.
/// Groupe · caisse · moyen (seulement ce que le serveur a rendu).
String _meta(ValidationItem item) => <String>[
      if (item.groupName.isNotEmpty) item.groupName,
      if (item.fundName.isNotEmpty) item.fundName,
      if (item.channel != null) _channelLabel(item.channel),
    ].join(' · ');

String _stageTitle(bool control) => control ? 'À contrôler' : 'À confirmer';
String _approveLabel(bool control) => control ? 'Contrôle conforme' : 'Paiement retrouvé — confirmer';

String _channelLabel(String? c) => switch (c) {
      'orange_money' => 'Orange Money',
      'mtn_momo' => 'MTN MoMo',
      'bank' => 'Virement bancaire',
      'international_transfer' => 'Transfert international',
      'cash' => 'Espèces',
      null => '—',
      _ => 'Autre moyen',
    };

/// File des déclarations sur lesquelles j'ai une décision à prendre. Le
/// serveur ne liste que ce que ma fonction permet — jamais mes propres
/// déclarations (séparation des responsabilités).
class ValidationQueueScreen extends StatefulWidget {
  const ValidationQueueScreen({super.key});

  @override
  State<ValidationQueueScreen> createState() => _ValidationQueueScreenState();
}

class _ValidationQueueScreenState extends State<ValidationQueueScreen> {
  Resource<List<ValidationItem>> _state = const ResourceLoading<List<ValidationItem>>();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final Resource<List<ValidationItem>> state = await context.read<GovernanceRepository>().listPendingValidations();
    if (mounted) setState(() => _state = state);
  }

  Future<void> _open(ValidationItem item) async {
    final bool? decided = await showKombeSheet<bool>(
      context,
      title: _stageTitle(item.control),
      builder: (_) => DecisionPanel(item: item),
    );
    // Décision enregistrée : la ligne quitte la file sans tout recharger.
    if (decided != true || !mounted) return;
    if (_state case ResourceReady<List<ValidationItem>>(:final List<ValidationItem> data)) {
      setState(() => _state = ResourceReady<List<ValidationItem>>(
            data.where((ValidationItem v) => v.contributionId != item.contributionId).toList(),
          ));
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Validations')),
        body: RefreshIndicator(
          onRefresh: _load,
          child: ResourceView<List<ValidationItem>>(
            resource: _state,
            onRetry: _load,
            emptyWhen: (List<ValidationItem> data) => data.isEmpty,
            emptyTitle: 'Tout est à jour',
            emptyBody: 'Rien à confirmer.',
            builder: (BuildContext context, List<ValidationItem> data) {
              final List<ValidationItem> confirm = data.where((ValidationItem v) => !v.control).toList();
              final List<ValidationItem> control = data.where((ValidationItem v) => v.control).toList();
              final int total = data.fold<int>(0, (int s, ValidationItem v) => s + v.amountXaf);
              return ListView(
                padding: const EdgeInsets.only(bottom: 32),
                children: <Widget>[
                  // File d'attente : combien, pour quel total (somme des lignes reçues).
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
                    child: KombeCard(
                      color: KombeColors.goldPale.withValues(alpha: .55),
                      borderColor: KombeColors.goldPale,
                      child: Row(
                        children: <Widget>[
                          const KombeIconBadge(Icons.fact_check_outlined, tone: KombeTone.money, size: 48),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: <Widget>[
                                Text('${data.length} paiement${data.length > 1 ? 's' : ''} en attente', style: Theme.of(context).textTheme.titleMedium),
                                const SizedBox(height: 4),
                                FittedBox(fit: BoxFit.scaleDown, alignment: Alignment.centerLeft, child: KombeAmount(total, size: 22, color: KombeColors.goldDark)),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  for (final (bool isControl, List<ValidationItem> items) in <(bool, List<ValidationItem>)>[(false, confirm), (true, control)])
                    if (items.isNotEmpty) ...<Widget>[
                      KombeSection('${_stageTitle(isControl)} · ${items.length}'),
                      KombeGroupedList(
                        children: <Widget>[
                          for (final ValidationItem item in items)
                            ListTile(
                              minTileHeight: 72,
                              leading: MemberAvatar(groupId: item.groupId, memberId: item.memberIdentityId, name: item.memberDisplayName, photoVersion: item.memberPhotoVersion, size: 42),
                              title: Text(item.memberDisplayName, maxLines: 1, overflow: TextOverflow.ellipsis),
                              subtitle: _meta(item).isEmpty ? null : Text(_meta(item), maxLines: 2, overflow: TextOverflow.ellipsis),
                              trailing: Text(Xaf.format(item.amountXaf), style: KombeType.amount(size: 16)),
                              onTap: () => _open(item),
                            ),
                        ],
                      ),
                    ],
                ],
              );
            },
          ),
        ),
      );
}

/// Ouverture directe (notification, lien) : même panneau en plein écran.
class ValidationDetailScreen extends StatefulWidget {
  const ValidationDetailScreen({required this.contributionId, super.key});
  final String contributionId;

  @override
  State<ValidationDetailScreen> createState() => _ValidationDetailScreenState();
}

class _ValidationDetailScreenState extends State<ValidationDetailScreen> {
  Resource<ValidationItem> _state = const ResourceLoading<ValidationItem>();

  @override
  void initState() {
    super.initState();
    context.read<GovernanceRepository>().getValidation(widget.contributionId).then((Resource<ValidationItem> s) {
      if (mounted) setState(() => _state = s);
    });
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(_state is ResourceReady<ValidationItem> ? _stageTitle((_state as ResourceReady<ValidationItem>).data.control) : 'Validation')),
        body: ResourceView<ValidationItem>(
          resource: _state,
          builder: (BuildContext context, ValidationItem item) => SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: DecisionPanel(item: item),
          ),
        ),
      );
}

/// Ce qui a été déclaré, puis la décision. Le bouton est verrouillé pendant
/// l'envoi ; le rejet exige un motif (transmis au membre).
class DecisionPanel extends StatefulWidget {
  const DecisionPanel({required this.item, super.key});
  final ValidationItem item;

  @override
  State<DecisionPanel> createState() => _DecisionPanelState();
}

class _DecisionPanelState extends State<DecisionPanel> {
  final TextEditingController _motif = TextEditingController();
  bool _rejecting = false;
  bool _sending = false;
  String? _error;

  @override
  void dispose() {
    _motif.dispose();
    super.dispose();
  }

  Future<void> _decide(ValidationDecision d) async {
    if (_sending) return;
    if (d == ValidationDecision.reject && _motif.text.trim().isEmpty) {
      setState(() => _error = 'Indiquez le motif : il est transmis au membre.');
      return;
    }
    setState(() {
      _sending = true;
      _error = null;
    });
    final OperationResult<void> r = await context.read<GovernanceRepository>().decideValidation(
          contributionId: widget.item.contributionId,
          expectedVersion: widget.item.version,
          decision: d,
          reason: _motif.text,
        );
    if (!mounted) return;
    switch (r) {
      case OperationSuccess<void>():
        unawaited(HapticFeedback.mediumImpact());
        if (d != ValidationDecision.reject) showKombeSeal(context, 'Confirmé');
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(d == ValidationDecision.reject
              ? 'Paiement rejeté. Le membre est prévenu.'
              : widget.item.control
                  ? 'Contrôle enregistré.'
                  : 'Paiement confirmé. Il est inscrit au registre du groupe.'),
        ));
        Navigator.of(context).maybePop(true);
      case OperationFailure<void>(:final Object error):
        setState(() {
          _sending = false;
          _error = '$error';
        });
      case OperationBlocked<void>():
        setState(() {
          _sending = false;
          _error = 'Cette décision n’est pas disponible depuis l’application pour le moment.';
        });
    }
  }

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    final ValidationItem item = widget.item;
    final String when = DateFormat.yMMMd(Localizations.localeOf(context).toLanguageTag()).add_Hm().format(item.declaredAtUtc.toLocal());
    return PopScope(
      canPop: !_sending,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          // Qui, combien : le montant domine, la personne l'identifie.
          KombeCard(
            padding: const EdgeInsets.fromLTRB(18, 18, 18, 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                Row(
                  children: <Widget>[
                    MemberAvatar(groupId: item.groupId, memberId: item.memberIdentityId, name: item.memberDisplayName, photoVersion: item.memberPhotoVersion, size: 44),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          Text(item.memberDisplayName, style: t.titleMedium),
                          Text(
                            <String>[if (item.groupName.isNotEmpty) item.groupName, if (item.fundName.isNotEmpty) item.fundName].join(' · '),
                            style: t.bodySmall,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                FittedBox(fit: BoxFit.scaleDown, alignment: Alignment.centerLeft, child: KombeAmount(item.amountXaf, size: 34)),
                const SizedBox(height: 10),
                const Divider(),
                _row(t, 'Moyen', _channelLabel(item.channel)),
                _row(t, 'Référence', item.evidenceName ?? 'Aucune (motif donné par le membre)'),
                _row(t, 'Déclaré le', when),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Text(
            item.control
                ? 'La trésorerie a déjà confirmé ce paiement. Vous en faites la seconde vérification.'
                : 'Confirmez seulement si vous retrouvez ce paiement (relevé, SMS de l’opérateur, caisse).',
            style: t.bodySmall?.copyWith(color: KombeColors.slate),
          ),
          if (_rejecting) ...<Widget>[
            const SizedBox(height: 14),
            TextField(
              controller: _motif,
              autofocus: true,
              maxLength: 500,
              minLines: 2,
              maxLines: 4,
              decoration: const InputDecoration(labelText: 'Motif du rejet', helperText: 'Transmis au membre.'),
            ),
          ],
          if (_error != null) ...<Widget>[
            const SizedBox(height: 8),
            Semantics(liveRegion: true, child: Text(_error!, style: t.bodyMedium?.copyWith(color: KombeColors.danger))),
          ],
          const SizedBox(height: 16),
          if (!_rejecting) ...<Widget>[
            FilledButton(
              onPressed: _sending ? null : () => _decide(ValidationDecision.validate),
              child: _sending
                  ? const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2.4))
                  : Text(_approveLabel(item.control)),
            ),
            const SizedBox(height: 8),
            OutlinedButton(
              onPressed: _sending ? null : () => setState(() => _rejecting = true),
              child: const Text('Rejeter…'),
            ),
          ] else ...<Widget>[
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: KombeColors.danger),
              onPressed: _sending ? null : () => _decide(ValidationDecision.reject),
              child: _sending
                  ? const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2.4))
                  : const Text('Rejeter le paiement'),
            ),
            const SizedBox(height: 8),
            TextButton(
              onPressed: _sending ? null : () => setState(() => _rejecting = false),
              child: const Text('Annuler'),
            ),
          ],
        ],
      ),
    );
  }

  Widget _row(TextTheme t, String k, String v) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            SizedBox(width: 110, child: Text(k, style: t.bodyMedium?.copyWith(color: KombeColors.slate))),
            Expanded(child: Text(v, style: t.bodyMedium)),
          ],
        ),
      );
}
