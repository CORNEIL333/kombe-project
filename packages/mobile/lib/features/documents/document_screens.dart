import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/state/resource.dart';
import '../../core/widgets/screen_states.dart';
import '../../core/widgets/section_card.dart';
import '../../domain/entities/document.dart';
import '../../domain/repositories/document_repository.dart';

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
        appBar: AppBar(title: const Text('Documents')),
        body: ResourceView<List<KombeDocument>>(
          resource: _state,
          emptyWhen: (List<KombeDocument> items) => items.isEmpty,
          builder: (BuildContext context, List<KombeDocument> items) =>
              ListView.separated(
            padding: const EdgeInsets.all(20),
            itemCount: items.length,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (BuildContext context, int index) {
              final KombeDocument item = items[index];
              return SectionCard(
                child: ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const CircleAvatar(
                    child: Icon(Icons.description_outlined),
                  ),
                  title: Text(item.title),
                  subtitle: Text(item.kind.name),
                  trailing: const Icon(Icons.open_in_new),
                  onTap: () => launchUrl(
                    item.downloadUri,
                    mode: LaunchMode.externalApplication,
                  ),
                ),
              );
            },
          ),
        ),
      );
}

class ExportCenterScreen extends StatefulWidget {
  const ExportCenterScreen({super.key});

  @override
  State<ExportCenterScreen> createState() => _ExportCenterScreenState();
}

class _ExportCenterScreenState extends State<ExportCenterScreen> {
  Resource<List<KombeDocument>> _state =
      const ResourceLoading<List<KombeDocument>>();

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _load();
  }

  Future<void> _load() async {
    final Resource<List<KombeDocument>> state =
        await context.read<DocumentRepository>().listExports();
    if (mounted) setState(() => _state = state);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Exports')),
        body: ResourceView<List<KombeDocument>>(
          resource: _state,
          emptyWhen: (List<KombeDocument> items) => items.isEmpty,
          builder: (BuildContext context, List<KombeDocument> items) =>
              ListView.separated(
            padding: const EdgeInsets.all(20),
            itemCount: items.length,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (BuildContext context, int index) {
              final KombeDocument item = items[index];
              return SectionCard(
                child: ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const CircleAvatar(
                    child: Icon(Icons.download_outlined),
                  ),
                  title: Text(item.title),
                  subtitle: const Text('Export produit par le serveur'),
                  trailing: const Icon(Icons.open_in_new),
                  onTap: () => launchUrl(
                    item.downloadUri,
                    mode: LaunchMode.externalApplication,
                  ),
                ),
              );
            },
          ),
        ),
      );
}
