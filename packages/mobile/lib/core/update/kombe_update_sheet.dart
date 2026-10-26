import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../design/kombe_colors.dart';
import '../design/kombe_theme.dart';
import 'kombe_update.dart';

/// Vérifie au plus toutes les 12 heures et propose la mise à jour si une
/// version plus récente est publiée. Silencieux s'il n'y a rien (ou pas de
/// réseau) ; une mise à jour obligatoire ne se ferme pas.
Future<void> kombeCheckForUpdate(BuildContext context, {KombeUpdater? updater, bool manual = false}) async {
  final KombeUpdater u = updater ?? KombeUpdater();
  if (!u.supported) {
    if (manual && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Mise à jour directe disponible sur Android uniquement.')));
    }
    return;
  }
  const String cle = 'kombe.maj.derniere_verif';
  final SharedPreferencesAsync prefs = SharedPreferencesAsync();
  if (!manual) {
    final int last = await prefs.getInt(cle) ?? 0;
    if (DateTime.now().millisecondsSinceEpoch - last < const Duration(hours: 12).inMilliseconds) return;
  }
  final UpdateCheck r = await u.check();
  await prefs.setInt(cle, DateTime.now().millisecondsSinceEpoch);
  if (!context.mounted) return;
  switch (r) {
    case UpdateAvailable():
      await showModalBottomSheet<void>(
        context: context,
        isDismissible: !r.mandatory,
        enableDrag: !r.mandatory,
        showDragHandle: !r.mandatory,
        backgroundColor: KombeColors.cream,
        builder: (_) => KombeUpdateSheet(check: r, updater: u),
      );
    case UpToDate(:final InstalledVersion installed):
      if (manual) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('KÓMBE ${installed.name} est à jour.')));
      }
    case UpdateUnavailable(:final String reason):
      if (manual) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(reason)));
  }
}

class KombeUpdateSheet extends StatefulWidget {
  const KombeUpdateSheet({required this.check, required this.updater, super.key});
  final UpdateAvailable check;
  final KombeUpdater updater;

  @override
  State<KombeUpdateSheet> createState() => _KombeUpdateSheetState();
}

class _KombeUpdateSheetState extends State<KombeUpdateSheet> {
  double? _progress;
  String? _error;
  bool _readyToInstall = false;

  String _taille(int octets) => octets <= 0 ? '' : ' · ${(octets / 1048576).toStringAsFixed(1)} Mo';

  Future<void> _go() async {
    setState(() {
      _error = null;
      _progress = _readyToInstall ? 1 : 0;
    });
    try {
      if (_readyToInstall) {
        await widget.updater.installDownloaded();
      } else {
        await widget.updater.download(widget.check.apk, progress: (double p) {
          if (mounted) setState(() => _progress = p);
        });
      }
      if (mounted) setState(() => _readyToInstall = true);
    } on InstallPermissionNeeded catch (e) {
      if (mounted) setState(() => (_readyToInstall = true, _error = e.toString(), _progress = null));
    } on Object catch (e) {
      if (mounted) setState(() => (_error = e.toString(), _progress = null));
    }
  }

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    final KombeRelease rel = widget.check.release;
    final bool busy = _progress != null && _progress! < 1;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(22, 8, 22, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Row(
              children: <Widget>[
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(color: KombeColors.mint, borderRadius: BorderRadius.circular(14)),
                  child: const Icon(Icons.system_update_rounded, color: KombeColors.emerald),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text(widget.check.mandatory ? 'Mise à jour requise' : 'Nouvelle version', style: KombeType.titre(size: 22)),
                      Text('KÓMBE ${rel.version} · vous avez ${widget.check.installed.name}${_taille(widget.check.apk.size)}', style: t.bodySmall),
                    ],
                  ),
                ),
              ],
            ),
            if (rel.notes.isNotEmpty) ...<Widget>[
              const SizedBox(height: 14),
              for (final String n in rel.notes.take(6))
                Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      const Padding(padding: EdgeInsets.only(top: 3), child: Icon(Icons.check_circle_rounded, size: 16, color: KombeColors.emerald)),
                      const SizedBox(width: 8),
                      Expanded(child: Text(n, style: t.bodyMedium?.copyWith(color: KombeColors.ink))),
                    ],
                  ),
                ),
            ],
            const SizedBox(height: 10),
            Text('Vos données restent sur le serveur : la mise à jour ne touche ni vos tontines ni votre session.', style: t.bodySmall),
            if (_progress != null) ...<Widget>[
              const SizedBox(height: 14),
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(value: _progress, minHeight: 8, backgroundColor: KombeColors.sand, color: KombeColors.emerald),
              ),
            ],
            if (_error != null)
              Padding(padding: const EdgeInsets.only(top: 12), child: Text(_error!, style: t.bodyMedium?.copyWith(color: KombeColors.danger))),
            const SizedBox(height: 18),
            FilledButton.icon(
              key: const Key('maj-installer'),
              onPressed: busy ? null : _go,
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(54), backgroundColor: KombeColors.forest),
              icon: busy
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : Icon(_readyToInstall ? Icons.install_mobile_rounded : Icons.download_rounded),
              label: Text(busy ? 'Téléchargement… ${((_progress ?? 0) * 100).round()} %' : _readyToInstall ? 'Installer' : 'Mettre à jour'),
            ),
            if (!widget.check.mandatory)
              TextButton(onPressed: busy ? null : () => Navigator.of(context).pop(), child: const Text('Plus tard')),
          ],
        ),
      ),
    );
  }
}
