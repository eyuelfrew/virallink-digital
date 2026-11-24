import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/async_value_view.dart';
import '../../../shared/widgets/common.dart';
import '../../../shared/widgets/screen_header.dart';
import '../../../shared/widgets/status_pill.dart';
import '../domain/task_item.dart';
import '../task_providers.dart';
import 'all_tasks_screen.dart';
import 'task_detail_screen.dart';
import 'widgets/task_list_tile.dart';

enum _TaskFilter { all, open, overdue, done }

class MyTasksScreen extends ConsumerStatefulWidget {
  const MyTasksScreen({super.key});

  @override
  ConsumerState<MyTasksScreen> createState() => _MyTasksScreenState();
}

class _MyTasksScreenState extends ConsumerState<MyTasksScreen> {
  _TaskFilter _filter = _TaskFilter.open;

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    final tasks = ref.watch(myTasksProvider);

    Future<void> refresh() async {
      ref.invalidate(myTasksProvider);
      try {
        await ref.read(myTasksProvider.future);
      } catch (_) {}
    }

    return Column(
      children: [
        ScreenHeader(
          title: 'My tasks',
          subtitle: 'Everything assigned to you',
          actions: [
            if (user?.can('task.read') ?? false)
              IconButton(
                tooltip: 'All tasks',
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => const AllTasksScreen(),
                  ),
                ),
                icon: const Icon(Icons.view_list_outlined),
              ),
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
            child: AsyncValueView<MyTasks>(
              value: tasks,
              onRefresh: refresh,
              loadingLabel: 'Loading your tasks',
              builder: (data) {
                if (!data.linked) {
                  return ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    children: const [
                      SizedBox(height: 40),
                      EmptyState(
                        title: 'No employee profile linked',
                        message:
                            'Your account is not connected to an employee '
                            'profile yet. An administrator can link it from '
                            'Settings → Users. Once linked, your assigned tasks '
                            'appear here.',
                        icon: Icons.link_off,
                      ),
                    ],
                  );
                }

                final filtered = _applyFilter(data.tasks);

                return ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.only(bottom: 26),
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
                      child: _CountsRow(data: data),
                    ),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                      child: _FilterRow(
                        selected: _filter,
                        onSelected: (value) => setState(() => _filter = value),
                      ),
                    ),
                    if (filtered.isEmpty)
                      EmptyState(
                        title: _emptyTitle(),
                        message: _emptyMessage(),
                        icon: _filter == _TaskFilter.done
                            ? Icons.check_circle_outline
                            : Icons.task_alt,
                        compact: true,
                      )
                    else
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        child: Column(
                          children: [
                            for (final task in filtered)
                              Padding(
                                padding: const EdgeInsets.only(bottom: 8),
                                child: TaskListTile(
                                  task: task,
                                  onTap: () => _openTask(task),
                                ),
                              ),
                          ],
                        ),
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

  List<TaskItem> _applyFilter(List<TaskItem> tasks) {
    switch (_filter) {
      case _TaskFilter.all:
        return tasks;
      case _TaskFilter.open:
        return tasks.where((task) => task.isOpen).toList();
      case _TaskFilter.overdue:
        return tasks.where((task) => task.isOverdue).toList();
      case _TaskFilter.done:
        return tasks.where((task) => task.isDone).toList();
    }
  }

  String _emptyTitle() {
    switch (_filter) {
      case _TaskFilter.all:
        return 'No tasks yet';
      case _TaskFilter.open:
        return 'Your queue is clear';
      case _TaskFilter.overdue:
        return 'Nothing overdue';
      case _TaskFilter.done:
        return 'Nothing completed yet';
    }
  }

  String _emptyMessage() {
    switch (_filter) {
      case _TaskFilter.all:
        return 'When work is assigned to you it will appear here.';
      case _TaskFilter.open:
        return 'You have no open tasks. Enjoy the breathing room.';
      case _TaskFilter.overdue:
        return 'Every open task is still inside its due date.';
      case _TaskFilter.done:
        return 'Completed tasks will collect here.';
    }
  }

  Future<void> _openTask(TaskItem task) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => TaskDetailScreen(initialTask: task),
      ),
    );
    if (mounted) {
      ref.invalidate(myTasksProvider);
    }
  }
}

class _CountsRow extends StatelessWidget {
  const _CountsRow({required this.data});

  final MyTasks data;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: _MiniStat(
            label: 'Open',
            value: '${data.open}',
            tone: StatusTone.brand,
            icon: Icons.list_alt,
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: _MiniStat(
            label: 'Overdue',
            value: '${data.overdue}',
            tone: data.overdue > 0 ? StatusTone.danger : StatusTone.neutral,
            icon: Icons.timer_outlined,
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: _MiniStat(
            label: 'Done',
            value: '${data.done}',
            tone: StatusTone.success,
            icon: Icons.check_circle_outline,
          ),
        ),
      ],
    );
  }
}

class _MiniStat extends StatelessWidget {
  const _MiniStat({
    required this.label,
    required this.value,
    required this.tone,
    required this.icon,
  });

  final String label;
  final String value;
  final StatusTone tone;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final colors = ToneColors.of(tone);
    return SurfaceCard(
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 10),
      child: Row(
        children: [
          Icon(icon, size: 15, color: colors.foreground),
          const SizedBox(width: 7),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  value,
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: colors.foreground,
                    height: 1.1,
                  ),
                ),
                const SizedBox(height: 1),
                Text(
                  label,
                  style: const TextStyle(
                    fontSize: 10.5,
                    color: AppColors.inkMuted,
                    fontWeight: FontWeight.w600,
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

class _FilterRow extends StatelessWidget {
  const _FilterRow({required this.selected, required this.onSelected});

  final _TaskFilter selected;
  final ValueChanged<_TaskFilter> onSelected;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 34,
      child: ListView(
        scrollDirection: Axis.horizontal,
        children: [
          _FilterChip(
            label: 'Open',
            selected: selected == _TaskFilter.open,
            onTap: () => onSelected(_TaskFilter.open),
          ),
          const SizedBox(width: 7),
          _FilterChip(
            label: 'Overdue',
            selected: selected == _TaskFilter.overdue,
            onTap: () => onSelected(_TaskFilter.overdue),
          ),
          const SizedBox(width: 7),
          _FilterChip(
            label: 'Done',
            selected: selected == _TaskFilter.done,
            onTap: () => onSelected(_TaskFilter.done),
          ),
          const SizedBox(width: 7),
          _FilterChip(
            label: 'All',
            selected: selected == _TaskFilter.all,
            onTap: () => onSelected(_TaskFilter.all),
          ),
        ],
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ChoiceChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => onTap(),
      showCheckmark: false,
      labelStyle: TextStyle(
        fontSize: 12.5,
        fontWeight: FontWeight.w600,
        color: selected ? AppColors.brand : AppColors.inkMuted,
      ),
    );
  }
}
