import '../../../core/utils/json.dart';

const taskOpenStatuses = ['todo', 'in_progress', 'review'];
const taskStatuses = [
  'todo',
  'in_progress',
  'review',
  'done',
  'cancelled',
];
const taskPriorities = ['low', 'medium', 'high', 'urgent'];

class TaskItem {
  const TaskItem({
    required this.id,
    required this.title,
    required this.status,
    required this.priority,
    required this.description,
    this.dueDate,
    this.completedAt,
    this.createdAt,
    this.updatedAt,
    this.assigneeId,
    this.assigneeUserId,
    this.assigneeName,
    this.clientId,
    this.clientName,
    this.projectId,
    this.projectTitle,
  });

  final int id;
  final String title;
  final String description;
  final String status;
  final String priority;
  final DateTime? dueDate;
  final DateTime? completedAt;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final int? assigneeId;
  final int? assigneeUserId;
  final String? assigneeName;
  final int? clientId;
  final String? clientName;
  final int? projectId;
  final String? projectTitle;

  bool get isOpen => taskOpenStatuses.contains(status);
  bool get isDone => status == 'done';
  bool get isOverdue {
    if (!isOpen || dueDate == null) return false;
    final due = DateTime(
      dueDate!.year,
      dueDate!.month,
      dueDate!.day,
      23,
      59,
      59,
    );
    return due.isBefore(DateTime.now());
  }

  TaskItem copyWith({String? status}) {
    return TaskItem(
      id: id,
      title: title,
      description: description,
      status: status ?? this.status,
      priority: priority,
      dueDate: dueDate,
      completedAt: completedAt,
      createdAt: createdAt,
      updatedAt: updatedAt,
      assigneeId: assigneeId,
      assigneeUserId: assigneeUserId,
      assigneeName: assigneeName,
      clientId: clientId,
      clientName: clientName,
      projectId: projectId,
      projectTitle: projectTitle,
    );
  }

  factory TaskItem.fromJson(Map<String, dynamic> json) {
    final assignee = mapOr(json['assignee']);
    return TaskItem(
      id: intOr(json['id']),
      title: stringOr(json['title'], 'Untitled task'),
      description: stringOr(json['description']),
      status: stringOr(json['status'], 'todo'),
      priority: stringOr(json['priority'], 'medium'),
      dueDate: dateOrNull(json['dueDate']),
      completedAt: dateOrNull(json['completedAt']),
      createdAt: dateOrNull(json['createdAt']),
      updatedAt: dateOrNull(json['updatedAt']),
      assigneeId: intOrNull(json['assigneeId']),
      assigneeUserId: intOrNull(json['assigneeUserId']),
      assigneeName: stringOrNull(assignee['name']),
      clientId: intOrNull(json['clientId']),
      clientName: stringOrNull(json['clientName']),
      projectId: intOrNull(json['projectId']),
      projectTitle: stringOrNull(json['projectTitle']),
    );
  }
}

class MyTasks {
  const MyTasks({
    required this.linked,
    required this.open,
    required this.overdue,
    required this.done,
    required this.byStatus,
    required this.tasks,
    this.employeeId,
    this.employeeName,
  });

  final bool linked;
  final int open;
  final int overdue;
  final int done;
  final Map<String, int> byStatus;
  final List<TaskItem> tasks;
  final int? employeeId;
  final String? employeeName;

  factory MyTasks.fromJson(Map<String, dynamic> json) {
    final employee = mapOr(json['employee']);
    final counts = mapOr(json['counts']);
    final rawStatuses = mapOr(counts['byStatus']);

    return MyTasks(
      linked: boolOr(json['linked']),
      open: intOr(counts['open']),
      overdue: intOr(counts['overdue']),
      done: intOr(counts['done']),
      byStatus: rawStatuses.map((key, value) => MapEntry(key, intOr(value))),
      tasks: mapsOr(json['tasks']).map(TaskItem.fromJson).toList(),
      employeeId: intOrNull(employee['id']),
      employeeName: stringOrNull(employee['name']),
    );
  }
}
