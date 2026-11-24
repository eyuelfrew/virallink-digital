import '../../../core/network/api_client.dart';
import '../../../core/network/api_response.dart';
import '../domain/client.dart';

class ClientRepository {
  ClientRepository(this._api);

  final ApiClient _api;

  Future<ApiPage<Client>> list({
    int page = 1,
    int pageSize = 20,
    String? search,
    String? status,
  }) async {
    final response = await _api.get(
      '/clients',
      query: {
        'page': page,
        'pageSize': pageSize,
        if (search != null && search.trim().isNotEmpty) 'search': search.trim(),
        if (status != null && status.isNotEmpty) 'status': status,
      },
    );

    return ApiPage.fromResponse(response, Client.fromJson);
  }

  Future<Client> get(int id) async {
    final response = await _api.get('/clients/$id');
    return Client.fromJson(response.asMap);
  }
}
