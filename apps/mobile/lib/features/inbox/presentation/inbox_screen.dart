import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/formatters.dart';
import '../../../shared/widgets/async_value_view.dart';
import '../../../shared/widgets/common.dart';
import '../../../shared/widgets/screen_header.dart';
import '../../../shared/widgets/status_pill.dart';
import '../../dashboard/domain/dashboard_summary.dart';
import '../../inquiries/domain/inquiry.dart';
import '../../inquiries/inquiry_providers.dart';
import '../../inquiries/presentation/inquiries_screen.dart';
import '../../inquiries/presentation/inquiry_detail_screen.dart';
import '../../invoices/presentation/invoice_detail_screen.dart';
import '../../tasks/domain/task_item.dart';
import '../../tasks/presentation/task_detail_screen.dart';
import '../data/inbox_repository.dart';
import '../inbox_providers.dart';

class InboxScreen extends ConsumerWidget {
  const InboxScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    final inbox = ref.watch(inboxProvider);

    Future<void> refresh() async {
      ref.invalidate(inboxProvider);
      ref.invalidate(unreadInquiriesProvider);
      try {
        await ref.read(inboxProvider.future);
      } catch (_) {}
    }

    return Column(
      children: [
        ScreenHeader(
          title: 'Inbox',
          subtitle: 'What needs your attention',
          actions: [
            IconButton(
              tooltip: 'Refresh',
              onPressed: refresh,
              icon: const Icon(Icons.refresh),
            ),
          ],
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: refresh,
            child: AsyncValueView<InboxSnapshot>(
              value: inbox,
              onRefresh: refresh,
              loadingLabel: 'Checking your inbox',
              builder: (data) {
                final openTasks =
                    (data.myTasks?.tasks ?? const <TaskItem>[])
                        .where((task) => task.isOpen && task.dueDate != null)
                        .toList()
                      ..sort((a, b) => a.dueDate!.compareTo(b.dueDate!));

                return ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.only(bottom: 28),
                  children: [
                    const Padding(
                      padding: EdgeInsets.fromLTRB(16, 4, 16, 0),
                      child: _PushNotice(),
                    ),
                    if (data.warnings.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
                        child: SurfaceCard(
                          color: AppColors.warningSoft,
                          borderColor: AppColors.warning.withValues(
                            alpha: 0.25,
                          ),
                          child: Text(
                            'Some sections could not refresh: '
                            '${data.warnings.join(' ')}',
                            style: const TextStyle(
                              fontSize: 11.5,
                              height: 1.4,
                              color: AppColors.warning,
                            ),
                          ),
                        ),
                      ),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                      child: Row(
                        children: [
                          Expanded(
                            child: _InboxStat(
                              label: 'Unread',
                              value: '${data.unreadCount}',
                              icon: Icons.mark_email_unread_outlined,
                              tone: data.unreadCount > 0
                                  ? StatusTone.warning
                                  : StatusTone.neutral,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: _InboxStat(
                              label: 'Open tasks',
                              value: '${data.openTasks}',
                              icon: Icons.list_alt,
                              tone: StatusTone.brand,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: _InboxStat(
                              label: 'Overdue',
                              value: '${data.overdueTasks}',
                              icon: Icons.timer_outlined,
                              tone: data.overdueTasks > 0
                                  ? StatusTone.danger
                                  : StatusTone.neutral,
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (data.inquiries.isNotEmpty) ...[
                      SectionHeader(
                        title: 'Unread enquiries',
                        subtitle: '${data.inquiries.length} waiting',
                        trailing: TextButton(
                          onPressed: () => Navigator.of(context).push(
                            MaterialPageRoute<void>(
                              builder: (_) => const InquiriesScreen(),
                            ),
                          ),
                          child: const Text('View all'),
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        child: Column(
                          children: [
                            for (final inquiry in data.inquiries.take(6))
                              Padding(
                                padding: const EdgeInsets.only(bottom: 8),
                                child: _InquiryRow(
                                  inquiry: inquiry,
                                  onTap: () =>
                                      _openInquiry(context, ref, inquiry),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ],
                    if (data.deadlines.isNotEmpty) ...[
                      const SectionHeader(
                        title: 'Upcoming deadlines',
                        subtitle: 'Projects and invoices',
                      ),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        child: Column(
                          children: [
                            for (final deadline in data.deadlines.take(6))
                              Padding(
                                padding: const EdgeInsets.only(bottom: 8),
                                child: _DeadlineRow(
                                  deadline: deadline,
                                  canOpenInvoice:
                                      user?.can('finance.read') ?? false,
                                ),
                              ),
                          ],
                        ),
                      ),
                    ],
                    if (openTasks.isNotEmpty) ...[
                      const SectionHeader(
                        title: 'Your next deadlines',
                        subtitle: 'Assigned work with a due date',
                      ),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        child: Column(
                          children: [
                            for (final task in openTasks.take(6))
                              Padding(
                                padding: const EdgeInsets.only(bottom: 8),
                                child: _TaskRow(
                                  task: task,
                                  onTap: () => _openTask(context, ref, task),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ],
                    if (data.isEmpty)
                      const EmptyState(
                        title: 'Nothing needs attention',
                        message:
                            'New enquiries, deadlines and assigned tasks will '
                            'collect here. Pull down to check again.',
                        icon: Icons.inbox_outlined,
                      ),
                  ],
                );
              },
            ),
          ),
        ),
      ],
    );
  }

  Future<void> _openInquiry(
    BuildContext context,
    WidgetRef ref,
    Inquiry inquiry,
  ) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => InquiryDetailScreen(initialInquiry: inquiry),
      ),
    );
    ref.invalidate(inboxProvider);
    ref.invalidate(unreadInquiriesProvider);
  }

  Future<void> _openTask(
    BuildContext context,
    WidgetRef ref,
    TaskItem task,
  ) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => TaskDetailScreen(initialTask: task),
      ),
    );
    ref.invalidate(inboxProvider);
  }
}

class _PushNotice extends StatelessWidget {
  const _PushNotice();

  @override
  Widget build(BuildContext context) {
    return SurfaceCard(
      color: AppColors.brandSoft,
      borderColor: AppColors.brand.withValues(alpha: 0.16),
      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            Icons.notifications_none_outlined,
            size: 19,
            color: AppColors.brand,
          ),
          SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Push notifications are coming next',
                  style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                    color: AppColors.brand,
                  ),
                ),
                SizedBox(height: 3),
                Text(
                  'This build refreshes the inbox when you open it. Task and '
                  'deadline alerts will arrive as push notifications once the '
                  'FCM integration is enabled.',
                  style: TextStyle(
                    fontSize: 11.5,
                    height: 1.45,
                    color: AppColors.inkMuted,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _InboxStat extends StatelessWidget {
  const _InboxStat({
    required this.label,
    required this.value,
    required this.icon,
    required this.tone,
  });

  final String label;
  final String value;
  final IconData icon;
  final StatusTone tone;

  @override
  Widget build(BuildContext context) {
    final colors = ToneColors.of(tone);
    return SurfaceCard(
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 16, color: colors.foreground),
          const SizedBox(height: 7),
          Text(
            value,
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w800,
              color: colors.foreground,
              height: 1.1,
            ),
          ),
          const SizedBox(height: 1),
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 10.5,
              color: AppColors.inkMuted,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _InquiryRow extends StatelessWidget {
  const _InquiryRow({required this.inquiry, required this.onTap});

  final Inquiry inquiry;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SurfaceCard(
      padding: const EdgeInsets.all(13),
      onTap: onTap,
      child: Row(
        children: [
          AppAvatar(name: inquiry.name, size: 38),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  inquiry.displaySubject,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  [
                    inquiry.name,
                    if (inquiry.company != null) inquiry.company!,
                  ].join(' · '),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 11,
                    color: AppColors.inkMuted,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              StatusPill.status(inquiry.status, compact: true),
              const SizedBox(height: 4),
              Text(
                AppFormat.relative(inquiry.createdAt),
                style: const TextStyle(fontSize: 10, color: AppColors.inkMuted),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _DeadlineRow extends StatelessWidget {
  const _DeadlineRow({required this.deadline, required this.canOpenInvoice});

  final DeadlineItem deadline;
  final bool canOpenInvoice;

  @override
  Widget build(BuildContext context) {
    final overdue = AppFormat.isOverdue(deadline.dueDate);
    final canOpen = deadline.isInvoice && canOpenInvoice;

    return SurfaceCard(
      padding: const EdgeInsets.all(13),
      onTap: canOpen
          ? () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => InvoiceDetailScreen(invoiceId: deadline.id),
              ),
            )
          : null,
      child: Row(
        children: [
          Icon(
            deadline.isInvoice
                ? Icons.receipt_long_outlined
                : Icons.folder_outlined,
            size: 18,
            color: overdue ? AppColors.danger : AppColors.brand,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  deadline.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 3),
                MetaText(
                  overdue
                      ? 'Overdue · ${AppFormat.date(deadline.dueDate)}'
                      : 'Due ${AppFormat.date(deadline.dueDate)}',
                  icon: Icons.event_outlined,
                  color: overdue ? AppColors.danger : AppColors.inkMuted,
                ),
              ],
            ),
          ),
          if (deadline.isInvoice && deadline.outstandingCents > 0)
            Text(
              AppFormat.cents(deadline.outstandingCents),
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: AppColors.warning,
              ),
            ),
        ],
      ),
    );
  }
}

class _TaskRow extends StatelessWidget {
  const _TaskRow({required this.task, required this.onTap});

  final TaskItem task;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SurfaceCard(
      padding: const EdgeInsets.all(13),
      onTap: onTap,
      child: Row(
        children: [
          Icon(
            task.isOverdue ? Icons.warning_amber_outlined : Icons.task_alt,
            size: 18,
            color: task.isOverdue ? AppColors.danger : AppColors.brand,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  task.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 3),
                MetaText(
                  task.isOverdue
                      ? 'Overdue · ${AppFormat.shortDate(task.dueDate)}'
                      : 'Due ${AppFormat.shortDate(task.dueDate)}',
                  icon: Icons.schedule,
                  color: task.isOverdue ? AppColors.danger : AppColors.inkMuted,
                ),
              ],
            ),
          ),
          StatusPill.status(task.status, compact: true),
        ],
      ),
    );
  }
}
