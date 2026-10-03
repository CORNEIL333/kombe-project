import '../../core/state/resource.dart';
import '../entities/document.dart';

abstract interface class DocumentRepository {
  Future<Resource<List<KombeDocument>>> listDocuments();
  Future<Resource<List<KombeDocument>>> listExports();
}
