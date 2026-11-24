import '../../../core/network/api_client.dart';
import '../domain/dashboard_summary.dart';

class DashboardRepository {
  DashboardRepository(this._api);

  final ApiClient _api;

  Future<DashboardSummary> summary() async {
    final response = await _api.get('/dashboard/summary');
    return DashboardSummary.fromJson(response.asMap);
  }
}
