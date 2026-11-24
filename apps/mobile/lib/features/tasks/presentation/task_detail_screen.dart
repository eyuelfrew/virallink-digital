import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/formatters.dart';
import '../../../shared/widgets/common.dart';
import '../../../shared/widgets/status_pill.dart';
import '../../dashboard/dashboard_providers.dart';
import '../../inbox/inbox_providers.dart';
import '../domain/task_item.dart';
import '../task_providers.dart';

class TaskDetailScreen extends ConsumerStatefulWidget {
  const TaskDetailScreen({super.key, required this.initialTask});

  final TaskItem initialTask;

  @override
  ConsumerState<TaskDetailScreen> createState() => _TaskDetailScreenState();
}

class _TaskDetailScreenState extends ConsumerState<TaskDetailScreen> {
  late TaskItem _task = widget.initialTask;
  bool _refreshing = false;
  bool _updating = false;

  bool get _canWrite =>
      ref.read(currentUserProvider)?.can('task.write') ?? false;

  bool get _canRead => ref.read(currentUserProvider)?.can('task.read') ?? false;

  @override
  void initState() {
    super.initState();
    if (_canRead) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _refresh());
    }
  }

  Future<void> _refresh() async {
    if (_refreshing) return;
    setState(() => _refreshing = true);
    try {
      final fresh = await ref.read(taskRepositoryProvider).get(_task.id);
      if (mounted) setState(() => _task = fresh);
    } catch (_) {
      // Keep showing the task the list already gave us.
    } finally {
      if (mounted) setState(() => _refreshing = false);
    }
  }

  Future<void> _changeStatus(String status) async {
    if (status == _task.status) return;

    setState(() => _updating = true);
    try {
      final updated = await ref
          .read(taskRepositoryProvider)
          .updateStatus(_task.id, status);

      if (!mounted) return;
      setState(() => _task = updated);
      ref.invalidate(myTasksProvider);
      ref.invalidate(dashboardSummaryProvider);
      ref.invalidate(inboxProvider);

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Task moved to ${AppFormat.titleCase(status)}.'),
        ),
      );
    } on ApiException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(error.message)));
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not update the task.')),
      );
    } finally {
      if (mounted) setState(() => _updating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final priorityTone = toneForStatus(_task.priority, kind: 'priority');

    return Scaffold(
      appBar: AppBar(
        title: const Text('Task'),
        actions: [
          if (_canRead)
            IconButton(
              tooltip: 'Refresh',
              onPressed: _refreshing ? null : _refresh,
              icon: _refreshing
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.refresh),
            ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 4,
                height: 52,
                margin: const EdgeInsets.only(top: 3),
                decoration: BoxDecoration(
                  color: ToneColors.of(priorityTone).foreground,
                  borderRadius: BorderRadius.circular(4),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _task.title,
                      style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                        height: 1.3,
                        letterSpacing: -0.3,
                      ),
                    ),
                    const SizedBox(height: 9),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        StatusPill.status(_task.status),
                        StatusPill(
                          label: AppFormat.titleCase(_task.priority),
                          tone: priorityTone,
                        ),
                        if (_task.isOverdue)
                          const StatusPill(
                            label: 'Overdue',
                            tone: StatusTone.danger,
                          ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),
          if (_task.description.trim().isNotEmpty) ...[
            SurfaceCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Description',
                    style: TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 7),
                  Text(
                    _task.description,
                    style: const TextStyle(
                      fontSize: 13,
                      height: 1.55,
                      color: AppColors.ink,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
          ],
          SurfaceCard(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
            child: Column(
              children: [
                InfoRow(
                  label: 'Assignee',
                  value: _task.assigneeName ?? 'Unassigned',
                  icon: Icons.person_outline,
                ),
                const Divider(height: 1),
                InfoRow(
                  label: 'Due date',
                  value: AppFormat.date(_task.dueDate),
                  icon: Icons.event_outlined,
                  valueColor: _task.isOverdue ? AppColors.danger : null,
                ),
                if (_task.clientName != null) ...[
                  const Divider(height: 1),
                  InfoRow(
                    label: 'Client',
                    value: _task.clientName!,
                    icon: Icons.business_outlined,
                  ),
                ],
                if (_task.projectTitle != null) ...[
                  const Divider(height: 1),
                  InfoRow(
                    label: 'Project',
                    value: _task.projectTitle!,
                    icon: Icons.folder_outlined,
                  ),
                ],
                const Divider(height: 1),
                InfoRow(
                  label: 'Created',
                  value: AppFormat.dateTime(_task.createdAt),
                  icon: Icons.add_circle_outline,
                ),
                if (_task.completedAt != null) ...[
                  const Divider(height: 1),
                  InfoRow(
                    label: 'Completed',
                    value: AppFormat.dateTime(_task.completedAt),
                    icon: Icons.check_circle_outline,
                    valueColor: AppColors.success,
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 18),
          if (_canWrite) ...[
            const Text(
              'Update status',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 9),
            SurfaceCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Wrap(
                    spacing: 7,
                    runSpacing: 7,
                    children: [
                      for (final status in taskStatuses)
                        ChoiceChip(
                          label: Text(AppFormat.titleCase(status)),
                          selected: _task.status == status,
                          showCheckmark: false,
                          onSelected: _updating
                              ? null
                              : (_) => _changeStatus(status),
                          labelStyle: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: _task.status == status
                                ? AppColors.brand
                                : AppColors.inkMuted,
                          ),
                        ),
                    ],
                  ),
                  if (_updating) ...[
                    const SizedBox(height: 12),
                    const Row(
                      children: [
                        SizedBox(
                          width: 15,
                          height: 15,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                        SizedBox(width: 8),
                        Text(
                          'Saving…',
                          style: TextStyle(
                            fontSize: 11.5,
                            color: AppColors.inkMuted,
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
            if (_task.isOpen) ...[
              const SizedBox(height: 12),
              FilledButton.icon(
                onPressed: _updating ? null : () => _changeStatus('done'),
                icon: const Icon(Icons.check_circle_outline, size: 19),
                label: const Text('Mark as done'),
              ),
            ],
          ] else ...[
            const SurfaceCard(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    Icons.visibility_outlined,
                    size: 17,
                    color: AppColors.inkMuted,
                  ),
                  SizedBox(width: 9),
                  Expanded(
                    child: Text(
                      'You can view this task, but your role cannot change its '
                      'status. Ask a project manager if it needs moving.',
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
          ],
        ],
      ),
    );
  }
}
