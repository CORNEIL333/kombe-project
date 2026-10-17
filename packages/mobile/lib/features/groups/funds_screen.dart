import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/design/kombe_theme.dart';
import '../../core/formatters/xaf.dart';
import '../../core/state/operation_result.dart';
import '../../core/state/resource.dart';
import '../../core/widgets/screen_states.dart';
import '../../domain/entities/fund.dart';
import '../../domain/repositories/fund_repository.dart';

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
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Caisse créée. Les membres sont prévenus.')));
      await _load();
    }
  }

  Future<void> _close(GroupFund f) async {
    final bool? ok = await showDialog<bool>(
      context: context,
      builder: (BuildContext ctx) => AlertDialog(
        title: Text('Clôturer « ${f.name} » ?'),
        content: const Text('Les cotisations dues jusqu’à aujourd’hui restent dues ; rien ne sera réclamé ensuite. La clôture est définitive.'),
        actions: <Widget>[
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Annuler')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: KombeColors.danger),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Clôturer'),
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
      appBar: AppBar(title: const Text('Caisses et cotisations')),
      floatingActionButton: canManage
          ? FloatingActionButton.extended(
              key: const Key('nouvelle-caisse'),
              onPressed: _create,
              backgroundColor: KombeColors.forest,
              foregroundColor: Colors.white,
              icon: const Icon(Icons.add_rounded),
              label: const Text('Nouvelle caisse'),
            )
          : null,
      body: RefreshIndicator(
        onRefresh: _load,
        child: ResourceView<GroupFunds>(
          resource: _state,
          builder: (BuildContext context, GroupFunds data) => ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 120),
            children: <Widget>[
              Text(
                'Votre tontine ouvre ses propres caisses : projet commun, fête, achat groupé, urgences… '
                'Chacune a sa règle. Une règle ne s’applique jamais aux séances passées.',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
              const SizedBox(height: 6),
              Text('Argent tenu par le trésorier, pas par KÓMBE.', style: Theme.of(context).textTheme.bodySmall),
              const SizedBox(height: 16),
              for (final GroupFund f in data.funds)
                _FundCard(fund: f, onClose: data.canManage && f.custom != null && !f.closed ? () => _close(f) : null),
              if (!data.canManage)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text('Le président, le vice-président ou le trésorier crée et modifie les caisses.',
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
  if (c == null) return f.perMeetingXaf > 0 ? '${Xaf.format(f.perMeetingXaf)} par séance' : 'Règle fixée par le règlement';
  return switch (c.mode) {
    FundMode.eachMeeting => '${Xaf.format(c.currentAmountXaf)} par séance',
    FundMode.oneTime => '${Xaf.format(c.currentAmountXaf)} une seule fois',
    FundMode.free => 'Contributions libres',
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
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: c != null && !fund.closed ? KombeColors.emerald.withValues(alpha: .35) : KombeColors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Expanded(child: Text(fund.name, style: KombeType.titre(size: 19, height: 1.2))),
              if (c != null)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: fund.closed ? KombeColors.sand : KombeColors.mint,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    fund.closed ? 'Clôturée' : 'Règle propre',
                    style: t.labelSmall?.copyWith(color: fund.closed ? KombeColors.slate : KombeColors.emerald, fontWeight: FontWeight.w700),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 6),
          Text(_ruleLabel(fund), style: t.bodyMedium?.copyWith(color: KombeColors.ink)),
          if ((c?.purpose ?? '').isNotEmpty) Text(c!.purpose!, style: t.bodySmall),
          const SizedBox(height: 8),
          Text(
            'Confirmé : ${Xaf.format(fund.confirmedXaf)}${fund.pendingXaf > 0 ? ' · En attente : ${Xaf.format(fund.pendingXaf)}' : ''}',
            style: t.bodySmall,
          ),
          if (target != null && target > 0) ...<Widget>[
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: (fund.confirmedXaf / target).clamp(0, 1).toDouble(),
                minHeight: 8,
                backgroundColor: KombeColors.sand,
                color: KombeColors.emerald,
              ),
            ),
            const SizedBox(height: 4),
            Text('${Xaf.format(fund.confirmedXaf)} sur ${Xaf.format(target)}', style: t.bodySmall),
          ],
          if (onClose != null)
            Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(
                onPressed: onClose,
                style: TextButton.styleFrom(foregroundColor: KombeColors.danger),
                icon: const Icon(Icons.lock_outline_rounded, size: 18),
                label: const Text('Clôturer'),
              ),
            ),
        ],
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
    const Map<FundMode, (String, String)> modes = <FundMode, (String, String)>{
      FundMode.eachMeeting: ('À chaque séance', 'Chaque membre verse ce montant à chaque séance.'),
      FundMode.oneTime: ('Une seule fois', 'Chaque membre verse ce montant une fois, à la prochaine séance.'),
      FundMode.free: ('Libre (volontaire)', 'Chacun verse ce qu’il veut. Rien n’est réclamé.'),
    };
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 0, 20, 20 + MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Text('Nouvelle caisse', style: KombeType.titre(size: 24)),
            const SizedBox(height: 4),
            Text('Effective dès aujourd’hui : jamais rétroactive.', style: t.bodySmall),
            const SizedBox(height: 16),
            TextField(
              key: const Key('caisse-nom'),
              controller: _name,
              maxLength: 80,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(labelText: 'Nom de la caisse', hintText: 'Ex. : Fête de fin d’année'),
            ),
            const SizedBox(height: 4),
            Text('Règle de cotisation', style: t.titleSmall),
            const SizedBox(height: 8),
            for (final MapEntry<FundMode, (String, String)> m in modes.entries)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: InkWell(
                  borderRadius: BorderRadius.circular(14),
                  onTap: () => setState(() => _mode = m.key),
                  child: Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: _mode == m.key ? KombeColors.mint : Colors.white,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: _mode == m.key ? KombeColors.emerald : KombeColors.line),
                    ),
                    child: Row(
                      children: <Widget>[
                        Icon(_mode == m.key ? Icons.radio_button_checked_rounded : Icons.radio_button_off_rounded,
                            color: _mode == m.key ? KombeColors.emerald : KombeColors.slate),
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
                decoration: const InputDecoration(labelText: 'Montant par membre', suffixText: 'FCFA'),
              ),
            const SizedBox(height: 12),
            TextField(
              controller: _purpose,
              maxLength: 280,
              decoration: const InputDecoration(labelText: 'À quoi sert-elle ? (facultatif)'),
            ),
            TextField(
              controller: _target,
              keyboardType: TextInputType.number,
              inputFormatters: <TextInputFormatter>[FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(10)],
              decoration: const InputDecoration(labelText: 'Objectif à atteindre (facultatif)', suffixText: 'FCFA'),
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(_error!, style: t.bodyMedium?.copyWith(color: KombeColors.danger)),
              ),
            const SizedBox(height: 18),
            FilledButton(
              key: const Key('caisse-creer'),
              onPressed: _valid && !_busy ? _submit : null,
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(54), backgroundColor: KombeColors.forest),
              child: _busy
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Text('Créer la caisse'),
            ),
          ],
        ),
      ),
    );
  }
}
