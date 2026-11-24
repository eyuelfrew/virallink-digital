import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../core/utils/formatters.dart';
import '../../../../shared/widgets/common.dart';
import '../../../../shared/widgets/status_pill.dart';
import '../../domain/task_item.dart';

class TaskListTile extends StatelessWidget {
  const TaskListTile({
    super.key,
    required this.task,
    this.onTap,
    this.showAssignee = false,
  });

  final TaskItem task;
  final VoidCallback? onTap;
  final bool showAssignee;

  @override
  Widget build(BuildContext context) {
    final priorityTone = toneForStatus(task.priority, kind: 'priority');
    final priorityColors = ToneColors.of(priorityTone);
    final overdue = task.isOverdue;

    return SurfaceCard(
      padding: const EdgeInsets.all(13),
      onTap: onTap,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 3,
            height: 44,
            margin: const EdgeInsets.only(top: 1),
            decoration: BoxDecoration(
              color: priorityColors.foreground,
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
                  style: TextStyle(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w600,
                    height: 1.35,
                    decoration: task.isDone ? TextDecoration.lineThrough : null,
                    color: task.isDone ? AppColors.inkMuted : AppColors.ink,
                  ),
                ),
                const SizedBox(height: 7),
                Wrap(
                  spacing: 6,
                  runSpacing: 5,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    StatusPill.status(task.status, compact: true),
                    StatusPill(
                      label: AppFormat.titleCase(task.priority),
                      tone: priorityTone,
                      compact: true,
                    ),
                    if (task.dueDate != null)
                      MetaText(
                        overdue
                            ? 'Overdue · ${AppFormat.shortDate(task.dueDate)}'
                            : 'Due ${AppFormat.shortDate(task.dueDate)}',
                        icon: Icons.schedule,
                        color: overdue ? AppColors.danger : AppColors.inkMuted,
                      ),
                  ],
                ),
                if ((task.clientName ?? task.projectTitle) != null) ...[
                  const SizedBox(height: 5),
                  MetaText(
                    [
                      if (task.clientName != null) task.clientName!,
                      if (task.projectTitle != null) task.projectTitle!,
                    ].join(' · '),
                    icon: Icons.workspaces_outline,
                  ),
                ],
                if (showAssignee && task.assigneeName != null) ...[
                  const SizedBox(height: 5),
                  MetaText(task.assigneeName!, icon: Icons.person_outline),
                ],
              ],
            ),
          ),
          const SizedBox(width: 6),
          const Padding(
            padding: EdgeInsets.only(top: 2),
            child: Icon(
              Icons.chevron_right,
              size: 18,
              color: AppColors.inkMuted,
            ),
          ),
        ],
      ),
    );
  }
}
