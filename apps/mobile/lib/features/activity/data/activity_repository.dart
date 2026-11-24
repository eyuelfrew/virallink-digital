import '../../../core/network/api_client.dart';
import '../../../core/network/api_response.dart';
import '../domain/activity_entry.dart';

class ActivityRepository {
  ActivityRepository(this._api);

  final ApiClient _api;

  Future<ApiPage<ActivityEntry>> list({
    int page = 1,
    int pageSize = 25,
    String? search,
  }) async {
    final response = await _api.get(
      '/activity',
      query: {
        'page': page,
        'pageSize': pageSize,
        if (search != null && search.trim().isNotEmpty) 'search': search.trim(),
      },
    );

    return ApiPage.fromResponse(response, ActivityEntry.fromJson);
  }
}
