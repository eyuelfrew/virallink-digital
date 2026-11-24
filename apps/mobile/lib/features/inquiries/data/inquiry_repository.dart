import '../../../core/network/api_client.dart';
import '../../../core/network/api_response.dart';
import '../../../core/utils/json.dart';
import '../domain/inquiry.dart';

class InquiryRepository {
  InquiryRepository(this._api);

  final ApiClient _api;

  Future<ApiPage<Inquiry>> list({
    int page = 1,
    int pageSize = 20,
    String? search,
    String? status,
    bool? isRead,
    bool? isArchived,
  }) async {
    final response = await _api.get(
      '/inquiries',
      query: {
        'page': page,
        'pageSize': pageSize,
        if (search != null && search.trim().isNotEmpty) 'search': search.trim(),
        if (status != null && status.isNotEmpty) 'status': status,
        'isRead': ?isRead,
        'isArchived': ?isArchived,
      },
    );

    return ApiPage.fromResponse(response, Inquiry.fromJson);
  }

  Future<Inquiry> get(int id) async {
    final response = await _api.get('/inquiries/$id');
    return Inquiry.fromJson(response.asMap);
  }

  Future<Inquiry> update(
    int id, {
    String? status,
    bool? isRead,
    bool? isArchived,
    String? notes,
  }) async {
    final response = await _api.put(
      '/inquiries/$id',
      body: {
        'status': ?status,
        'isRead': ?isRead,
        'isArchived': ?isArchived,
        'notes': ?notes,
      },
    );

    final data = response.asMap;
    return Inquiry.fromJson(
      mapOr(data['inquiry']).isEmpty ? data : mapOr(data['inquiry']),
    );
  }
}
