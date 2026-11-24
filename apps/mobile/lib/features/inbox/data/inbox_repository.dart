import '../../../core/network/api_exception.dart';
import '../../auth/domain/app_user.dart';
import '../../dashboard/data/dashboard_repository.dart';
import '../../dashboard/domain/dashboard_summary.dart';
import '../../inquiries/data/inquiry_repository.dart';
import '../../inquiries/domain/inquiry.dart';
import '../../tasks/data/task_repository.dart';
import '../../tasks/domain/task_item.dart';

/// The Inbox tab is a single "what needs attention" view.
///
/// Push delivery (FCM/APNs) is deliberately not wired yet. Until it is, the
/// inbox is assembled on demand from endpoints the app already has access to:
/// unread enquiries, upcoming deadlines, and the signed-in person's tasks.
class InboxSnapshot {
  const InboxSnapshot({
    required this.inquiries,
    required this.deadlines,
    required this.myTasks,
    this.warnings = const [],
  });

  final List<Inquiry> inquiries;
  final List<DeadlineItem> deadlines;
  final MyTasks? myTasks;
  final List<String> warnings;

  int get unreadCount => inquiries.where((item) => !item.isRead).length;
  int get openTasks => myTasks?.open ?? 0;
  int get overdueTasks => myTasks?.overdue ?? 0;

  bool get isEmpty =>
      inquiries.isEmpty &&
      deadlines.isEmpty &&
      (myTasks == null || myTasks!.tasks.isEmpty);
}

class InboxRepository {
  InboxRepository({
    required InquiryRepository inquiries,
    required DashboardRepository dashboard,
    required TaskRepository tasks,
  }) : _inquiries = inquiries,
       _dashboard = dashboard,
       _tasks = tasks;

  final InquiryRepository _inquiries;
  final DashboardRepository _dashboard;
  final TaskRepository _tasks;

  Future<InboxSnapshot> load(AppUser user) async {
    final warnings = <String>[];
    var inquiries = <Inquiry>[];
    var deadlines = <DeadlineItem>[];
    MyTasks? myTasks;

    if (user.can('inquiry.read')) {
      try {
        final page = await _inquiries.list(
          pageSize: 20,
          isRead: false,
          isArchived: false,
        );
        inquiries = page.items;
      } catch (error) {
        warnings.add(_message(error));
      }
    }

    if (user.can('client.read')) {
      try {
        final summary = await _dashboard.summary();
        deadlines = summary.deadlines
            .where((item) => item.dueDate != null)
            .take(8)
            .toList();
      } catch (error) {
        warnings.add(_message(error));
      }
    }

    try {
      myTasks = await _tasks.myTasks();
    } catch (error) {
      warnings.add(_message(error));
    }

    if (inquiries.isEmpty && deadlines.isEmpty && myTasks == null) {
      throw ApiException(
        message: warnings.isNotEmpty
            ? warnings.first
            : 'Could not load your inbox right now.',
      );
    }

    return InboxSnapshot(
      inquiries: inquiries,
      deadlines: deadlines,
      myTasks: myTasks,
      warnings: warnings,
    );
  }

  String _message(Object error) {
    if (error is ApiException) return error.message;
    return 'Something went wrong.';
  }
}
