import '../../core/state/operation_result.dart';
import '../../core/state/resource.dart';
import '../entities/support_ticket.dart';

/// Mes demandes au support KÓMBE (CRM, `/v1/me/support-tickets`).
abstract interface class SupportRepository {
  Future<Resource<List<SupportTicketSummary>>> myTickets();
  Future<OperationResult<String>> open(SupportTicketDraft draft);
  Future<Resource<SupportTicket>> ticket(String ticketId);
  Future<OperationResult<void>> reply(String ticketId, String body);
  Future<OperationResult<void>> rate(String ticketId, int score, {String? comment});
}
