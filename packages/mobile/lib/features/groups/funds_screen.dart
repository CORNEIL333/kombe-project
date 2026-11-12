import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/design/kombe_spacing.dart';
import '../../core/design/kombe_theme.dart';
import '../../core/formatters/xaf.dart';
import '../../core/state/operation_result.dart';
import '../../core/state/resource.dart';
import '../../core/widgets/kombe_components.dart';
import '../../core/widgets/screen_states.dart';
import '../../domain/entities/fund.dart';
import '../../domain/repositories/fund_repository.dart';
import '../../l10n/app_localizations.dart';
import '../../l10n/kombe_l10n.dart';

/// Caisses et cotisations du groupe. Les caisses du règlement suivent les
/// statuts ; le bureau ouvre en plus les caisses propres à la tontine
/// (projet, fête, achat groupé, urgences…), chacune avec sa règle : à chaque
/// séance, une seule fois, ou libre. Aucune règle n'est rétroactive.
class FundsScreen extends StatefulWidget {
  const FundsScreen({required this.groupId, super.key});
  final String groupId;

  @override
  State<FundsScreen> createState() => _FundsScreenState();
}

class _FundsScreenState extends State<FundsScreen> {
  Resource<GroupFunds> _state = const ResourceLoading<GroupFunds>();

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_state is ResourceLoading<GroupFunds>) _load();
  }

  Future<void> _load() async {
    final Resource<GroupFunds> r = await context.read<FundRepository>().listFunds(widget.groupId);
    if (mounted) setState(() => _state = r);
  }

  Future<void> _create() async {
    final bool? ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: KombeColors.cream,
      builder: (_) => Provider<FundRepository>.value(
        value: context.read<FundRepository>(),
        child: _NewFundSheet(groupId: widget.groupId),
      ),
    );
    if (ok == true) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(AppLocalizations.of(context).fuCaisseCreeeLesMembresSont)));
      await _load();
    }
  }

  Future<void> _close(GroupFund f) async {
    final bool? ok = await showDialog<bool>(
      context: context,
      builder: (BuildContext ctx) => AlertDialog(
        title: Text(AppLocalizations.of(context).fuCloturer(f.name)),
        content: Text(AppLocalizations.of(context).fuLesCotisationsDuesJusquaAujourdhui),
        actions: <Widget>[
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: Text(AppLocalizations.of(context).cancel)),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: KombeColors.danger),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(AppLocalizations.of(context).fuCloturer2),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final OperationResult<void> r = await context.read<FundRepository>().closeFund(widget.groupId, f.id);
    if (!mounted) return;
    if (r case OperationFailure<void>(:final Object error)) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.toString())));
    }
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    final bool canManage = switch (_state) {
      ResourceReady<GroupFunds>(:final GroupFunds data) => data.canManage,
      _ => false,
    };
    return Scaffold(
      appBar: AppBar(title: Text(AppLocalizations.of(context).gdCaisses)),
      floatingActionButton: canManage
          ? FloatingActionButton.extended(
              key: const Key('nouvelle-caisse'),
              onPressed: _create,
              icon: const Icon(Icons.add_rounded),
              label: Text(AppLocalizations.of(context).fuNouvelleCaisse),
            )
          : null,
      body: RefreshIndicator(
        onRefresh: _load,
        child: ResourceView<GroupFunds>(
          resource: _state,
          onRetry: _load,
          emptyWhen: (GroupFunds d) => d.funds.isEmpty,
          emptyTitle: AppLocalizations.of(context).fuAucuneCaisse,
          emptyBody: AppLocalizations.of(context).fuLesCaissesDuGroupeApparaitront,
          builder: (BuildContext context, GroupFunds data) => ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 120),
            children: <Widget>[
              for (final GroupFund f in data.funds)
                _FundCard(fund: f, onClose: data.canManage && f.custom != null && !f.closed ? () => _close(f) : null),
              if (!data.canManage)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(AppLocalizations.of(context).fuLePresidentLeVicePresident,
                      style: Theme.of(context).textTheme.bodySmall),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

String _ruleLabel(GroupFund f) {
  final CustomFundRules? c = f.custom;
  if (c == null) return f.perMeetingXaf > 0 ? KombeL10n.current.fuParSeance(Xaf.format(f.perMeetingXaf)) : KombeL10n.current.fuRegleFixeeParLeReglement;
  return switch (c.mode) {
    FundMode.eachMeeting => KombeL10n.current.fuParSeance2(Xaf.format(c.currentAmountXaf)),
    FundMode.oneTime => KombeL10n.current.fuUneSeuleFois(Xaf.format(c.currentAmountXaf)),
    FundMode.free => KombeL10n.current.fuContributionsLibres,
  };
}

class _FundCard extends StatelessWidget {
  const _FundCard({required this.fund, this.onClose});
  final GroupFund fund;
  final VoidCallback? onClose;

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    final CustomFundRules? c = fund.custom;
    final int? target = c?.targetXaf;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: KombeCard(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              children: <Widget>[
                KombeIconBadge(Icons.account_balance_wallet_outlined, tone: fund.closed ? KombeTone.neutral : KombeTone.money, size: 40),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text(fund.name, style: t.titleMedium),
                      Text(_ruleLabel(fund), style: t.bodySmall),
                    ],
                  ),
                ),
                if (c != null) ...<Widget>[
                  const SizedBox(width: 8),
                  StatusPill(fund.closed ? AppLocalizations.of(context).fuCloturee : AppLocalizations.of(context).fuReglePropre, tone: fund.closed ? KombeTone.neutral : KombeTone.brand),
                ],
              ],
            ),
            if ((c?.purpose ?? '').isNotEmpty) ...<Widget>[
              const SizedBox(height: 8),
              Text(c!.purpose!, style: t.bodyMedium),
            ],
            const SizedBox(height: 14),
            Text(AppLocalizations.of(context).fuConfirme, style: t.bodySmall),
            const SizedBox(height: 2),
            FittedBox(fit: BoxFit.scaleDown, alignment: Alignment.centerLeft, child: KombeAmount(fund.confirmedXaf, size: 26)),
            if (fund.pendingXaf > 0) ...<Widget>[
              const SizedBox(height: 8),
              StatusPill(AppLocalizations.of(context).fuEnAttente(Xaf.format(fund.pendingXaf)), tone: KombeTone.warning, icon: Icons.hourglass_top_rounded),
            ],
            if (target != null && target > 0) ...<Widget>[
              const SizedBox(height: 12),
              LinearProgressIndicator(value: (fund.confirmedXaf / target).clamp(0, 1).toDouble(), minHeight: 8),
              const SizedBox(height: 6),
              Text(AppLocalizations.of(context).fuObjectif(Xaf.format(target)), style: t.bodySmall),
            ],
            if (onClose != null)
              Align(
                alignment: Alignment.centerRight,
                child: TextButton.icon(
                  onPressed: onClose,
                  style: TextButton.styleFrom(foregroundColor: KombeColors.danger),
                  icon: const Icon(Icons.lock_outline_rounded, size: 18),
                  label: Text(AppLocalizations.of(context).fuCloturer2),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _NewFundSheet extends StatefulWidget {
  const _NewFundSheet({required this.groupId});
  final String groupId;

  @override
  State<_NewFundSheet> createState() => _NewFundSheetState();
}

class _NewFundSheetState extends State<_NewFundSheet> {
  final TextEditingController _name = TextEditingController();
  final TextEditingController _amount = TextEditingController();
  final TextEditingController _purpose = TextEditingController();
  final TextEditingController _target = TextEditingController();
  FundMode _mode = FundMode.eachMeeting;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _amount.dispose();
    _purpose.dispose();
    _target.dispose();
    super.dispose();
  }

  int? _int(TextEditingController c) => int.tryParse(c.text.trim());

  bool get _valid => _name.text.trim().length >= 2 && (_mode == FundMode.free || (_int(_amount) ?? 0) > 0);

  Future<void> _submit() async {
    if (!_valid || _busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final OperationResult<void> r = await context.read<FundRepository>().createFund(
          widget.groupId,
          FundCreation(
            name: _name.text,
            mode: _mode,
            amountXaf: _int(_amount),
            purpose: _purpose.text,
            targetXaf: _int(_target),
          ),
        );
    if (!mounted) return;
    switch (r) {
      case OperationSuccess<void>():
        Navigator.of(context).pop(true);
      case OperationBlocked<void>(:final String reason):
        setState(() => (_busy = false, _error = reason));
      case OperationFailure<void>(:final Object error):
        setState(() => (_busy = false, _error = error.toString()));
    }
  }

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    final Map<FundMode, (String, String)> modes = <FundMode, (String, String)>{
      FundMode.eachMeeting: (AppLocalizations.of(context).fuChaqueSeance, AppLocalizations.of(context).fuChaqueMembreVerseCeMontant),
      FundMode.oneTime: (AppLocalizations.of(context).fuUneSeuleFois2, AppLocalizations.of(context).fuChaqueMembreVerseCeMontant2),
      FundMode.free: (AppLocalizations.of(context).fuLibreVolontaire, AppLocalizations.of(context).fuChacunVerseCeQuilVeut),
    };
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 0, 20, 20 + MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Text(AppLocalizations.of(context).fuNouvelleCaisse, style: KombeType.display(size: 24)),
            const SizedBox(height: 4),
            Text(AppLocalizations.of(context).fuEffectiveDesAujourdhuiJamaisRetroactive, style: t.bodySmall),
            const SizedBox(height: 16),
            TextField(
              key: const Key('caisse-nom'),
              controller: _name,
              maxLength: 80,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(labelText: AppLocalizations.of(context).fuNomDeLaCaisse, hintText: AppLocalizations.of(context).fuExFeteDeFinDannee),
            ),
            const SizedBox(height: 4),
            Text(AppLocalizations.of(context).fuRegleDeCotisation, style: t.titleSmall),
            const SizedBox(height: 8),
            for (final MapEntry<FundMode, (String, String)> m in modes.entries)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: InkWell(
                  borderRadius: BorderRadius.circular(KombeSpacing.tileRadius),
                  onTap: () => setState(() => _mode = m.key),
                  child: Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: _mode == m.key ? KombeColors.mint : Colors.white,
                      borderRadius: BorderRadius.circular(KombeSpacing.tileRadius),
                      border: Border.all(color: _mode == m.key ? KombeColors.jade : KombeColors.lineStrong),
                    ),
                    child: Row(
                      children: <Widget>[
                        Icon(_mode == m.key ? Icons.radio_button_checked_rounded : Icons.radio_button_off_rounded,
                            color: _mode == m.key ? KombeColors.jade : KombeColors.slate),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: <Widget>[
                              Text(m.value.$1, style: t.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
                              Text(m.value.$2, style: t.bodySmall),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            if (_mode != FundMode.free)
              TextField(
                key: const Key('caisse-montant'),
                controller: _amount,
                keyboardType: TextInputType.number,
                inputFormatters: <TextInputFormatter>[FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(10)],
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(labelText: AppLocalizations.of(context).fuMontantParMembre, suffixText: 'FCFA'),
              ),
            const SizedBox(height: 12),
            TextField(
              controller: _purpose,
              maxLength: 280,
              decoration: InputDecoration(labelText: AppLocalizations.of(context).fuQuoiSertElleFacultatif),
            ),
            TextField(
              controller: _target,
              keyboardType: TextInputType.number,
              inputFormatters: <TextInputFormatter>[FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(10)],
              decoration: InputDecoration(labelText: AppLocalizations.of(context).fuObjectifAtteindreFacultatif, suffixText: 'FCFA'),
            ),
            if (_error != null)
              Padding(padding: const EdgeInsets.only(top: 12), child: KombeInlineError(_error!)),
            const SizedBox(height: 18),
            FilledButton(
              key: const Key('caisse-creer'),
              onPressed: _valid && !_busy ? _submit : null,
              child: _busy
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : Text(AppLocalizations.of(context).fuCreerLaCaisse),
            ),
          ],
        ),
      ),
    );
  }
}
