import '../../../core/utils/json.dart';

class ActivityEntry {
  const ActivityEntry({
    required this.id,
    required this.action,
    required this.entity,
    required this.createdAt,
    this.entityId,
    this.userEmail,
    this.userName,
    this.ip,
    this.metadata = const {},
  });

  final int id;
  final String action;
  final String entity;
  final int? entityId;
  final String? userEmail;
  final String? userName;
  final String? ip;
  final DateTime? createdAt;
  final Map<String, dynamic> metadata;

  factory ActivityEntry.fromJson(Map<String, dynamic> json) {
    final user = mapOr(json['user']);
    return ActivityEntry(
      id: intOr(json['id']),
      action: stringOr(json['action'], 'update'),
      entity: stringOr(json['entity'], 'record'),
      entityId: intOrNull(json['entityId']),
      userEmail: stringOrNull(json['userEmail']) ?? stringOrNull(user['email']),
      userName: stringOrNull(user['name']),
      ip: stringOrNull(json['ip']),
      metadata: mapOr(json['metadata']),
      createdAt: dateOrNull(json['createdAt']),
    );
  }
}
