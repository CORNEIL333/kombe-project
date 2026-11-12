import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/formatters/labels.dart';
import '../../core/state/resource.dart';
import '../../core/widgets/screen_states.dart';
import '../../core/widgets/kombe_components.dart';
import '../../domain/entities/document.dart';
import '../../domain/repositories/document_repository.dart';
import '../../l10n/app_localizations.dart';

class DocumentsScreen extends StatefulWidget {
  const DocumentsScreen({super.key});

  @override
  State<DocumentsScreen> createState() => _DocumentsScreenState();
}

class _DocumentsScreenState extends State<DocumentsScreen> {
  Resource<List<KombeDocument>> _state =
      const ResourceLoading<List<KombeDocument>>();

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _load();
  }

  Future<void> _load() async {
    final Resource<List<KombeDocument>> state =
        await context.read<DocumentRepository>().listDocuments();
    if (mounted) setState(() => _state = state);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(AppLocalizations.of(context).documentsMenu)),
        body: ResourceView<List<KombeDocument>>(
          resource: _state,
          onRetry: _load,
          emptyWhen: (List<KombeDocument> items) => items.isEmpty,
          emptyTitle: AppLocalizations.of(context).dcAucunDocument,
          emptyBody: AppLocalizations.of(context).dcRelevesRapportsDeCycleEt,
          builder: (BuildContext context, List<KombeDocument> items) => ListView(
            padding: const EdgeInsets.only(top: 8, bottom: 32),
            children: <Widget>[
              KombeGroupedList(
                children: <Widget>[
                  for (final KombeDocument item in items)
                    KombeMenuRow(
                      icon: _icon(item.kind),
                      tone: item.kind == DocumentKind.dispute ? KombeTone.danger : KombeTone.brand,
                      title: item.title,
                      subtitle: KombeLabels.documentKind(item.kind),
                      external: true,
                      onTap: () {
                        // Lien non sécurisé : on ne l'ouvre pas, et on le dit.
                        if (item.downloadUri.scheme != 'https') {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text(AppLocalizations.of(context).dcCeDocumentNestPasDisponible)),
                          );
                          return;
                        }
                        unawaited(launchUrl(item.downloadUri, mode: LaunchMode.externalApplication));
                      },
                    ),
                ],
              ),
            ],
          ),
        ),
      );
}

IconData _icon(DocumentKind k) => switch (k) {
      DocumentKind.statement => Icons.receipt_long_outlined,
      DocumentKind.cycleReport => Icons.donut_large_rounded,
      DocumentKind.export => Icons.table_view_outlined,
      DocumentKind.rules => Icons.menu_book_outlined,
      DocumentKind.dispute => Icons.report_gmailerrorred_rounded,
      DocumentKind.other => Icons.description_outlined,
    };
