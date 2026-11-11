/// Demande d'assistance au support KÓMBE (CRM de la plateforme, ADR-0046) :
/// `GET/POST /v1/me/support-tickets`. La référence (KMB-000001) sert
/// d'accusé de réception ; seules les réponses publiques du support sont
/// visibles, jamais ses notes internes ni le nom de l'opérateur.
enum SupportStatus { received, inProgress, awaitingMe, resolved, closed }

SupportStatus supportStatusFrom(Object? v) => switch ('$v') {
      'en_cours' => SupportStatus.inProgress,
      'attente_membre' => SupportStatus.awaitingMe,
      'resolu' => SupportStatus.resolved,
      'ferme' => SupportStatus.closed,
      _ => SupportStatus.received,
    };

String supportStatusLabel(SupportStatus s) => switch (s) {
      SupportStatus.received => 'Reçue',
      SupportStatus.inProgress => 'En cours',
      SupportStatus.awaitingMe => 'Attend votre réponse',
      SupportStatus.resolved => 'Résolue',
      SupportStatus.closed => 'Close',
    };

/// Sujets proposés (identiques à la PWA et au CRM).
const Map<String, String> supportCategories = <String, String>{
  'connexion': 'Connexion',
  'cotisation': 'Cotisation',
  'remise': 'Remise de la cagnotte',
  'amende': 'Amende',
  'statuts': 'Statuts',
  'application': 'Utilisation de l’application',
  'donnees_personnelles': 'Mes données personnelles (accès, rectification, effacement)',
  'reclamation': 'Réclamation',
  'autre': 'Autre',
};

String supportCategoryLabel(String c) => supportCategories[c] ?? 'Autre';

final class SupportTicketSummary {
  const SupportTicketSummary({
    required this.ticketId,
    required this.ref,
    required this.subject,
    required this.category,
    required this.status,
    required this.updatedAtUtc,
    this.groupName,
    this.satisfaction,
  });
  final String ticketId;
  final String ref;
  final String subject;
  final String category;
  final SupportStatus status;
  final DateTime updatedAtUtc;
  final String? groupName;
  final int? satisfaction;
}

final class SupportMessage {
  const SupportMessage({required this.messageId, required this.fromMe, required this.body, required this.createdAtUtc});
  final String messageId;
  final bool fromMe;
  final String body;
  final DateTime createdAtUtc;
}

final class SupportTicket {
  const SupportTicket({
    required this.ticketId,
    required this.ref,
    required this.subject,
    required this.category,
    required this.status,
    required this.messages,
    this.satisfaction,
  });
  final String ticketId;
  final String ref;
  final String subject;
  final String category;
  final SupportStatus status;
  final List<SupportMessage> messages;
  final int? satisfaction;

  bool get canReply => status != SupportStatus.closed;
  bool get canRate => satisfaction == null && (status == SupportStatus.resolved || status == SupportStatus.closed);
}

final class SupportTicketDraft {
  const SupportTicketDraft({required this.subject, required this.category, required this.body, this.groupId});
  final String subject;
  final String category;
  final String body;
  final String? groupId;
}

DateTime _date(Object? v) => DateTime.tryParse('$v')?.toUtc() ?? DateTime.fromMillisecondsSinceEpoch(0, isUtc: true);
int? _int(Object? v) => v is num ? v.toInt() : int.tryParse('${v ?? ''}');

SupportTicketSummary supportSummaryFrom(Map<String, dynamic> j) => SupportTicketSummary(
      ticketId: '${j['ticketId']}',
      ref: '${j['ref']}',
      subject: '${j['subject']}',
      category: '${j['category']}',
      status: supportStatusFrom(j['status']),
      updatedAtUtc: _date(j['updatedAt'] ?? j['createdAt']),
      groupName: j['groupName'] as String?,
      satisfaction: _int(j['satisfaction']),
    );

SupportTicket supportTicketFrom(Map<String, dynamic> j) => SupportTicket(
      ticketId: '${j['ticketId']}',
      ref: '${j['ref']}',
      subject: '${j['subject']}',
      category: '${j['category']}',
      status: supportStatusFrom(j['status']),
      satisfaction: _int(j['satisfaction']),
      messages: <SupportMessage>[
        for (final Object? m in (j['messages'] as List<Object?>? ?? const <Object?>[]))
          if (m is Map<String, dynamic>)
            SupportMessage(
              messageId: '${m['messageId']}',
              fromMe: m['from'] == 'moi',
              body: '${m['body']}',
              createdAtUtc: _date(m['createdAt']),
            ),
      ],
    );
