import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import 'data/task_repository.dart';
import 'domain/task_item.dart';

final taskRepositoryProvider = Provider<TaskRepository>((ref) {
  return TaskRepository(ref.watch(apiClientProvider));
});

final myTasksProvider = FutureProvider.autoDispose<MyTasks>((ref) async {
  return ref.watch(taskRepositoryProvider).myTasks();
});

final taskDetailProvider = FutureProvider.autoDispose.family<TaskItem, int>((
  ref,
  id,
) async {
  return ref.watch(taskRepositoryProvider).get(id);
});
