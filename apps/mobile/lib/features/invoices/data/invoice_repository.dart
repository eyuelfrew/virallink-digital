import '../../../core/network/api_client.dart';
import '../../../core/network/api_response.dart';
import '../domain/invoice.dart';

class InvoiceRepository {
  InvoiceRepository(this._api);

  final ApiClient _api;

  Future<ApiPage<Invoice>> list({
    int page = 1,
    int pageSize = 20,
    String? search,
    String? status,
  }) async {
    final response = await _api.get(
      '/finance/invoices',
      query: {
        'page': page,
        'pageSize': pageSize,
        if (search != null && search.trim().isNotEmpty) 'search': search.trim(),
        if (status != null && status.isNotEmpty) 'status': status,
      },
    );

    return ApiPage.fromResponse(response, Invoice.fromJson);
  }

  Future<Invoice> get(int id) async {
    final response = await _api.get('/finance/invoices/$id');
    return Invoice.fromJson(response.asMap);
  }
}
