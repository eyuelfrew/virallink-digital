import '../../../core/network/api_client.dart';
import '../../../core/network/api_response.dart';
import '../../../core/utils/json.dart';
import '../domain/task_item.dart';

class TaskRepository {
  TaskRepository(this._api);

  final ApiClient _api;

  Future<MyTasks> myTasks() async {
    final response = await _api.get('/tasks/mine');
    return MyTasks.fromJson(response.asMap);
  }

  Future<ApiPage<TaskItem>> list({
    int page = 1,
    int pageSize = 20,
    String? search,
    String? status,
    String? priority,
    bool? openOnly,
  }) async {
    final response = await _api.get(
      '/tasks',
      query: {
        'page': page,
        'pageSize': pageSize,
        if (search != null && search.trim().isNotEmpty) 'search': search.trim(),
        if (status != null && status.isNotEmpty) 'status': status,
        if (priority != null && priority.isNotEmpty) 'priority': priority,
        if (openOnly == true) 'openOnly': true,
      },
    );

    return ApiPage.fromResponse(response, TaskItem.fromJson);
  }

  Future<TaskItem> get(int id) async {
    final response = await _api.get('/tasks/$id');
    return TaskItem.fromJson(response.asMap);
  }

  Future<TaskItem> updateStatus(int id, String status) async {
    final response = await _api.put('/tasks/$id', body: {'status': status});
    return TaskItem.fromJson(response.asMap);
  }

  Future<TaskItem> update(
    int id, {
    String? title,
    String? description,
    String? status,
    String? priority,
    DateTime? dueDate,
    int? assigneeId,
  }) async {
    final response = await _api.put(
      '/tasks/$id',
      body: {
        'title': ?title,
        'description': ?description,
        'status': ?status,
        'priority': ?priority,
        'dueDate': ?dueDate?.toIso8601String(),
        'assigneeId': ?assigneeId,
      },
    );
    return TaskItem.fromJson(response.asMap);
  }

  Future<void> delete(int id) => _api.delete('/tasks/$id');

  /// Employees are needed to assign a task. Only users with `employee.read`
  /// can load them, so the caller must gate the picker.
  Future<List<Map<String, dynamic>>> assignableEmployees() async {
    final response = await _api.get(
      '/employees',
      query: {'page': 1, 'pageSize': 100},
    );
    return mapsOr(response.data);
  }
}
