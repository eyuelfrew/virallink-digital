import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/formatters.dart';
import '../../../shared/widgets/async_value_view.dart';
import '../../../shared/widgets/common.dart';
import '../../../shared/widgets/status_pill.dart';
import '../../auth/domain/app_user.dart';
import '../../activity/domain/activity_entry.dart';
import '../../inquiries/domain/inquiry.dart';
import '../../inquiries/presentation/inquiry_detail_screen.dart';
import '../../invoices/presentation/invoice_detail_screen.dart';
import '../../tasks/domain/task_item.dart';
import '../../tasks/presentation/task_detail_screen.dart';
import '../../tasks/task_providers.dart';
import '../dashboard_providers.dart';
import '../domain/dashboard_summary.dart';

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    final canSeeDashboard = user?.can('client.read') ?? false;

    if (!canSeeDashboard) {
      return _MyDayView(user: user);
    }

    final summary = ref.watch(dashboardSummaryProvider);
    final myTasks = ref.watch(myTasksProvider);

    Future<void> refresh() async {
      ref.invalidate(dashboardSummaryProvider);
      ref.invalidate(myTasksProvider);
      try {
        await Future.wait([
          ref.read(dashboardSummaryProvider.future),
          ref.read(myTasksProvider.future),
        ]);
      } catch (_) {
        // The error state renders from the providers.
      }
    }

    return RefreshIndicator(
      onRefresh: refresh,
      child: AsyncValueView<DashboardSummary>(
        value: summary,
        onRefresh: refresh,
        loadingLabel: 'Loading your dashboard',
        builder: (data) {
          return ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.only(bottom: 28),
            children: [
              _DashboardHeader(user: user),
              if (data.counts.isFirstRun &&
                  data.finance.lifetime.incomeCents == 0)
                const Padding(
                  padding: EdgeInsets.fromLTRB(16, 14, 16, 0),
                  child: _FirstRunCard(),
                ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                child: _CountGrid(counts: data.counts),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                child: _FinanceCard(finance: data.finance),
              ),
              if (data.trends.isNotEmpty) ...[
                const SectionHeader(
                  title: 'Revenue trend',
                  subtitle: 'Last 12 months',
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: _TrendBars(trends: data.trends),
                ),
              ],
              _MyTasksPreview(asyncTasks: myTasks),
              if (data.deadlines.isNotEmpty) ...[
                const SectionHeader(
                  title: 'Upcoming deadlines',
                  subtitle: 'Projects and invoices that need attention',
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Column(
                    children: [
                      for (final item in data.deadlines.take(5))
                        Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: _DeadlineTile(
                            item: item,
                            canOpenInvoice: user?.can('finance.read') ?? false,
                          ),
                        ),
                    ],
                  ),
                ),
              ],
              if (data.recentInquiries.isNotEmpty) ...[
                SectionHeader(
                  title: 'Recent enquiries',
                  subtitle: '${data.counts.unreadInquiries} unread',
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Column(
                    children: [
                      for (final inquiry in data.recentInquiries.take(5))
                        Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: _InquiryTile(
                            inquiry: inquiry,
                            canOpen: user?.can('inquiry.read') ?? false,
                          ),
                        ),
                    ],
                  ),
                ),
              ],
              if (data.recentActivity.isNotEmpty) ...[
                const SectionHeader(title: 'Recent activity'),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: SurfaceCard(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 4,
                    ),
                    child: Column(
                      children: [
                        for (
                          var i = 0;
                          i < data.recentActivity.length;
                          i++
                        ) ...[
                          _ActivityRow(entry: data.recentActivity[i]),
                          if (i < data.recentActivity.length - 1)
                            const Divider(height: 1),
                        ],
                      ],
                    ),
                  ),
                ),
              ],
            ],
          );
        },
      ),
    );
  }
}

class _DashboardHeader extends StatelessWidget {
  const _DashboardHeader({required this.user});

  final AppUser? user;

  @override
  Widget build(BuildContext context) {
    final firstName = (user?.name ?? 'there').split(' ').first;
    final hour = DateTime.now().hour;
    final greeting = hour < 12
        ? 'Good morning'
        : hour < 17
        ? 'Good afternoon'
        : 'Good evening';

    return Container(
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 20),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.brand, AppColors.brandDark],
        ),
        borderRadius: BorderRadius.only(
          bottomLeft: Radius.circular(22),
          bottomRight: Radius.circular(22),
        ),
      ),
      child: SafeArea(
        bottom: false,
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '$greeting, $firstName',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 21,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.4,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    AppFormat.date(DateTime.now()),
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.78),
                      fontSize: 12.5,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
            AppAvatar(
              name: user?.name,
              size: 44,
              background: Colors.white.withValues(alpha: 0.16),
              foreground: Colors.white,
            ),
          ],
        ),
      ),
    );
  }
}

class _FirstRunCard extends StatelessWidget {
  const _FirstRunCard();

  @override
  Widget build(BuildContext context) {
    return SurfaceCard(
      color: AppColors.accentSoft,
      borderColor: AppColors.accent.withValues(alpha: 0.35),
      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            Icons.rocket_launch_outlined,
            color: AppColors.warning,
            size: 20,
          ),
          SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Your workspace is ready',
                  style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700),
                ),
                SizedBox(height: 3),
                Text(
                  'Add the first client and project from the web admin. '
                  'They will appear here immediately.',
                  style: TextStyle(
                    fontSize: 12,
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

class _CountGrid extends StatelessWidget {
  const _CountGrid({required this.counts});

  final DashboardCounts counts;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Row(
          children: [
            Expanded(
              child: _CountCard(
                label: 'Active clients',
                value: '${counts.clientsActive}',
                hint: '${counts.clientsTotal} total',
                icon: Icons.business_outlined,
                tone: StatusTone.brand,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _CountCard(
                label: 'Active projects',
                value: '${counts.projectsActive}',
                hint: '${counts.projectsCompleted} completed',
                icon: Icons.folder_outlined,
                tone: StatusTone.info,
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: _CountCard(
                label: 'Team',
                value: '${counts.employees}',
                hint: 'Active employees',
                icon: Icons.groups_outlined,
                tone: StatusTone.success,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _CountCard(
                label: 'Unread enquiries',
                value: '${counts.unreadInquiries}',
                hint: 'Awaiting a reply',
                icon: Icons.mark_email_unread_outlined,
                tone: counts.unreadInquiries > 0
                    ? StatusTone.warning
                    : StatusTone.neutral,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _CountCard extends StatelessWidget {
  const _CountCard({
    required this.label,
    required this.value,
    required this.hint,
    required this.icon,
    required this.tone,
  });

  final String label;
  final String value;
  final String hint;
  final IconData icon;
  final StatusTone tone;

  @override
  Widget build(BuildContext context) {
    final colors = ToneColors.of(tone);
    return SurfaceCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 30,
                height: 30,
                decoration: BoxDecoration(
                  color: colors.background,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(icon, size: 16, color: colors.foreground),
              ),
              const Spacer(),
              Text(
                value,
                style: const TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.5,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            label,
            style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 2),
          Text(
            hint,
            style: const TextStyle(fontSize: 11, color: AppColors.inkMuted),
          ),
        ],
      ),
    );
  }
}

class _FinanceCard extends StatelessWidget {
  const _FinanceCard({required this.finance});

  final DashboardFinance finance;

  @override
  Widget build(BuildContext context) {
    final profitPositive = finance.month.profitCents >= 0;
    return SurfaceCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text(
                'This month',
                style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700),
              ),
              const Spacer(),
              StatusPill(
                label: finance.currency,
                tone: StatusTone.neutral,
                compact: true,
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _MoneyBlock(
                  label: 'Income',
                  value: AppFormat.cents(
                    finance.month.incomeCents,
                    currency: finance.currency,
                  ),
                  color: AppColors.success,
                ),
              ),
              Expanded(
                child: _MoneyBlock(
                  label: 'Expenses',
                  value: AppFormat.cents(
                    finance.month.expenseCents,
                    currency: finance.currency,
                  ),
                  color: AppColors.danger,
                ),
              ),
            ],
          ),
          const Divider(height: 22),
          Row(
            children: [
              Expanded(
                child: _MoneyBlock(
                  label: 'Profit',
                  value: AppFormat.cents(
                    finance.month.profitCents,
                    currency: finance.currency,
                  ),
                  color: profitPositive ? AppColors.success : AppColors.danger,
                  emphasized: true,
                ),
              ),
              Expanded(
                child: _MoneyBlock(
                  label: 'Outstanding',
                  value: AppFormat.cents(
                    finance.outstandingCents,
                    currency: finance.currency,
                  ),
                  color: AppColors.warning,
                  emphasized: true,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _MoneyBlock extends StatelessWidget {
  const _MoneyBlock({
    required this.label,
    required this.value,
    required this.color,
    this.emphasized = false,
  });

  final String label;
  final String value;
  final Color color;
  final bool emphasized;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            fontSize: 11,
            color: AppColors.inkMuted,
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(height: 3),
        Text(
          value,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            fontSize: emphasized ? 15.5 : 14,
            fontWeight: FontWeight.w800,
            color: color,
            letterSpacing: -0.2,
          ),
        ),
      ],
    );
  }
}

class _TrendBars extends StatelessWidget {
  const _TrendBars({required this.trends});

  final List<TrendPoint> trends;

  @override
  Widget build(BuildContext context) {
    final maxValue = trends
        .map(
          (trend) => trend.incomeCents > trend.expenseCents
              ? trend.incomeCents
              : trend.expenseCents,
        )
        .fold<int>(0, (max, value) => value > max ? value : max);

    return SurfaceCard(
      padding: const EdgeInsets.fromLTRB(12, 14, 12, 10),
      child: Column(
        children: [
          SizedBox(
            height: 92,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                for (var i = 0; i < trends.length; i++)
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 2.5),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          _Bar(
                            fraction: maxValue == 0
                                ? 0
                                : trends[i].incomeCents / maxValue,
                            color: AppColors.brand,
                          ),
                          const SizedBox(width: 2),
                          _Bar(
                            fraction: maxValue == 0
                                ? 0
                                : trends[i].expenseCents / maxValue,
                            color: AppColors.accent,
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              for (var i = 0; i < trends.length; i++)
                Expanded(
                  child: Text(
                    i % 3 == 0 ? trends[i].label : '',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 9.5,
                      color: AppColors.inkMuted,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 10),
          const Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _LegendDot(color: AppColors.brand, label: 'Income'),
              SizedBox(width: 16),
              _LegendDot(color: AppColors.accent, label: 'Expenses'),
            ],
          ),
        ],
      ),
    );
  }
}

class _Bar extends StatelessWidget {
  const _Bar({required this.fraction, required this.color});

  final double fraction;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: FractionallySizedBox(
        heightFactor: fraction.clamp(0.02, 1.0).toDouble(),
        alignment: Alignment.bottomCenter,
        child: Container(
          decoration: BoxDecoration(
            color: color,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(2)),
          ),
        ),
      ),
    );
  }
}

class _LegendDot extends StatelessWidget {
  const _LegendDot({required this.color, required this.label});

  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 5),
        Text(
          label,
          style: const TextStyle(
            fontSize: 10.5,
            color: AppColors.inkMuted,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}

class _MyTasksPreview extends StatelessWidget {
  const _MyTasksPreview({required this.asyncTasks});

  final AsyncValue<MyTasks> asyncTasks;

  @override
  Widget build(BuildContext context) {
    return asyncTasks.when(
      loading: () => const Padding(
        padding: EdgeInsets.fromLTRB(16, 20, 16, 0),
        child: LoadingView(label: 'Loading your tasks'),
      ),
      error: (_, _) => const SizedBox.shrink(),
      data: (data) {
        if (!data.linked) {
          return const Padding(
            padding: EdgeInsets.fromLTRB(16, 20, 16, 0),
            child: SurfaceCard(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.link_off, size: 18, color: AppColors.inkMuted),
                  SizedBox(width: 9),
                  Expanded(
                    child: Text(
                      'Your account is not linked to an employee profile yet. '
                      'An administrator can link it from Settings → Users.',
                      style: TextStyle(
                        fontSize: 12,
                        height: 1.45,
                        color: AppColors.inkMuted,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          );
        }

        final open = data.tasks.where((task) => task.isOpen).take(4).toList();

        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SectionHeader(
              title: 'My tasks',
              subtitle:
                  '${data.open} open · ${data.overdue} overdue · ${data.done} done',
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: open.isEmpty
                  ? const SurfaceCard(
                      child: Row(
                        children: [
                          Icon(
                            Icons.check_circle_outline,
                            size: 18,
                            color: AppColors.success,
                          ),
                          SizedBox(width: 9),
                          Text(
                            'Nothing open. Your queue is clear.',
                            style: TextStyle(
                              fontSize: 12.5,
                              color: AppColors.inkMuted,
                            ),
                          ),
                        ],
                      ),
                    )
                  : Column(
                      children: [
                        for (final task in open)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: _TaskPreviewTile(task: task),
                          ),
                      ],
                    ),
            ),
          ],
        );
      },
    );
  }
}

class _TaskPreviewTile extends StatelessWidget {
  const _TaskPreviewTile({required this.task});

  final TaskItem task;

  @override
  Widget build(BuildContext context) {
    return SurfaceCard(
      padding: const EdgeInsets.all(13),
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => TaskDetailScreen(initialTask: task),
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 3,
            height: 34,
            decoration: BoxDecoration(
              color: ToneColors.of(
                toneForStatus(task.priority, kind: 'priority'),
              ).foreground,
              borderRadius: BorderRadius.circular(3),
            ),
          ),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  task.title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    height: 1.3,
                  ),
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    StatusPill.status(task.status, compact: true),
                    const SizedBox(width: 7),
                    if (task.dueDate != null)
                      MetaText(
                        AppFormat.isOverdue(task.dueDate)
                            ? 'Overdue · ${AppFormat.shortDate(task.dueDate)}'
                            : 'Due ${AppFormat.shortDate(task.dueDate)}',
                        icon: Icons.schedule,
                        color: AppFormat.isOverdue(task.dueDate)
                            ? AppColors.danger
                            : AppColors.inkMuted,
                      ),
                  ],
                ),
              ],
            ),
          ),
          const Icon(Icons.chevron_right, size: 18, color: AppColors.inkMuted),
        ],
      ),
    );
  }
}

class _DeadlineTile extends StatelessWidget {
  const _DeadlineTile({required this.item, required this.canOpenInvoice});

  final DeadlineItem item;
  final bool canOpenInvoice;

  @override
  Widget build(BuildContext context) {
    final overdue = AppFormat.isOverdue(item.dueDate);
    final canOpen = item.isInvoice && canOpenInvoice;

    return SurfaceCard(
      padding: const EdgeInsets.all(13),
      onTap: canOpen
          ? () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => InvoiceDetailScreen(invoiceId: item.id),
              ),
            )
          : null,
      child: Row(
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: overdue ? AppColors.dangerSoft : AppColors.brandSoft,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(
              item.isInvoice
                  ? Icons.receipt_long_outlined
                  : Icons.folder_outlined,
              size: 16,
              color: overdue ? AppColors.danger : AppColors.brand,
            ),
          ),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 3),
                Row(
                  children: [
                    MetaText(
                      overdue
                          ? 'Overdue · ${AppFormat.date(item.dueDate)}'
                          : 'Due ${AppFormat.date(item.dueDate)}',
                      icon: Icons.event_outlined,
                      color: overdue ? AppColors.danger : AppColors.inkMuted,
                    ),
                    if (item.isInvoice && item.outstandingCents > 0) ...[
                      const SizedBox(width: 10),
                      MetaText(
                        AppFormat.cents(item.outstandingCents),
                        icon: Icons.payments_outlined,
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
          if (canOpen)
            const Icon(
              Icons.chevron_right,
              size: 18,
              color: AppColors.inkMuted,
            ),
        ],
      ),
    );
  }
}

class _InquiryTile extends StatelessWidget {
  const _InquiryTile({required this.inquiry, required this.canOpen});

  final Inquiry inquiry;
  final bool canOpen;

  @override
  Widget build(BuildContext context) {
    return SurfaceCard(
      padding: const EdgeInsets.all(13),
      onTap: canOpen
          ? () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => InquiryDetailScreen(initialInquiry: inquiry),
              ),
            )
          : null,
      child: Row(
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(
              color: inquiry.isRead ? AppColors.line : AppColors.accent,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  inquiry.displaySubject,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  inquiry.company ?? inquiry.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 11.5,
                    color: AppColors.inkMuted,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          StatusPill.status(inquiry.status, compact: true),
          const SizedBox(width: 6),
          Text(
            AppFormat.relative(inquiry.createdAt),
            style: const TextStyle(fontSize: 10.5, color: AppColors.inkMuted),
          ),
        ],
      ),
    );
  }
}

class _ActivityRow extends StatelessWidget {
  const _ActivityRow({required this.entry});

  final ActivityEntry entry;

  @override
  Widget build(BuildContext context) {
    final action = entry.action;
    final entity = entry.entity;
    final icon = _iconFor(action);
    final description = '${_verb(action)} ${entity.replaceAll('_', ' ')}';

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 9),
      child: Row(
        children: [
          Icon(icon, size: 15, color: AppColors.inkMuted),
          const SizedBox(width: 9),
          Expanded(
            child: Text(
              description,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 12, height: 1.3),
            ),
          ),
          const SizedBox(width: 8),
          Text(
            AppFormat.relative(entry.createdAt),
            style: const TextStyle(fontSize: 10.5, color: AppColors.inkMuted),
          ),
        ],
      ),
    );
  }

  String _verb(String action) {
    switch (action) {
      case 'login':
        return 'Signed in to';
      case 'create':
      case 'financial_create':
        return 'Created';
      case 'delete':
      case 'financial_delete':
        return 'Deleted';
      case 'publish':
        return 'Published';
      case 'unpublish':
        return 'Unpublished';
      case 'archive':
        return 'Archived';
      default:
        return 'Updated';
    }
  }

  IconData _iconFor(String action) {
    switch (action) {
      case 'login':
        return Icons.login;
      case 'create':
      case 'financial_create':
        return Icons.add_circle_outline;
      case 'delete':
      case 'financial_delete':
        return Icons.delete_outline;
      case 'publish':
      case 'unpublish':
        return Icons.public;
      default:
        return Icons.edit_outlined;
    }
  }
}

class _MyDayView extends ConsumerWidget {
  const _MyDayView({required this.user});

  final AppUser? user;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tasks = ref.watch(myTasksProvider);

    Future<void> refresh() async {
      ref.invalidate(myTasksProvider);
      try {
        await ref.read(myTasksProvider.future);
      } catch (_) {}
    }

    return RefreshIndicator(
      onRefresh: refresh,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.only(bottom: 28),
        children: [
          _DashboardHeader(user: user),
          const SectionHeader(title: 'My day', subtitle: 'Your assigned work'),
          AsyncValueView<MyTasks>(
            value: tasks,
            onRefresh: refresh,
            builder: (data) {
              if (!data.linked) {
                return const EmptyState(
                  title: 'No employee profile linked',
                  message:
                      'Ask an administrator to link your account to an employee '
                      'profile. Your tasks will then appear here.',
                  icon: Icons.link_off,
                );
              }

              final open = data.tasks.where((task) => task.isOpen).toList();

              return Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Column(
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: _CountCard(
                            label: 'Open',
                            value: '${data.open}',
                            hint: 'Assigned to you',
                            icon: Icons.list_alt,
                            tone: StatusTone.brand,
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: _CountCard(
                            label: 'Overdue',
                            value: '${data.overdue}',
                            hint: 'Past the due date',
                            icon: Icons.timer_outlined,
                            tone: data.overdue > 0
                                ? StatusTone.danger
                                : StatusTone.neutral,
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: _CountCard(
                            label: 'Done',
                            value: '${data.done}',
                            hint: 'Completed',
                            icon: Icons.check_circle_outline,
                            tone: StatusTone.success,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    if (open.isEmpty)
                      const EmptyState(
                        title: 'Your queue is clear',
                        message: 'Nothing is assigned to you right now.',
                        icon: Icons.check_circle_outline,
                        compact: true,
                      )
                    else
                      Column(
                        children: [
                          for (final task in open)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 8),
                              child: _TaskPreviewTile(task: task),
                            ),
                        ],
                      ),
                  ],
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}
