import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../dashboard/dashboard_providers.dart';
import '../inquiries/inquiry_providers.dart';
import '../tasks/task_providers.dart';
import 'data/inbox_repository.dart';

final inboxRepositoryProvider = Provider<InboxRepository>((ref) {
  return InboxRepository(
    inquiries: ref.watch(inquiryRepositoryProvider),
    dashboard: ref.watch(dashboardRepositoryProvider),
    tasks: ref.watch(taskRepositoryProvider),
  );
});

final inboxProvider = FutureProvider.autoDispose<InboxSnapshot>((ref) async {
  final user = ref.watch(currentUserProvider);
  if (user == null) {
    return const InboxSnapshot(inquiries: [], deadlines: [], myTasks: null);
  }
  return ref.watch(inboxRepositoryProvider).load(user);
});
