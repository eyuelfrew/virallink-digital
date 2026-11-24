import '../../../core/utils/json.dart';

class Inquiry {
  const Inquiry({
    required this.id,
    required this.name,
    required this.email,
    required this.status,
    required this.isRead,
    required this.isArchived,
    this.phone,
    this.company,
    this.subject,
    this.message,
    this.notes,
    this.serviceTitle,
    this.assignedToName,
    this.createdAt,
    this.updatedAt,
  });

  final int id;
  final String name;
  final String email;
  final String? phone;
  final String? company;
  final String? subject;
  final String? message;
  final String status;
  final bool isRead;
  final bool isArchived;
  final String? notes;
  final String? serviceTitle;
  final String? assignedToName;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  String get displaySubject {
    final clean = (subject ?? '').trim();
    if (clean.isNotEmpty) return clean;
    final fromCompany = (company ?? '').trim();
    if (fromCompany.isNotEmpty) return fromCompany;
    return 'General enquiry';
  }

  factory Inquiry.fromJson(Map<String, dynamic> json) {
    final service = mapOr(json['service']);
    final assignee = mapOr(json['assignedTo']);
    return Inquiry(
      id: intOr(json['id']),
      name: stringOr(json['name'], 'Unknown sender'),
      email: stringOr(json['email']),
      phone: stringOrNull(json['phone']),
      company: stringOrNull(json['company']),
      subject: stringOrNull(json['subject']),
      message: stringOrNull(json['message']),
      status: stringOr(json['status'], 'new'),
      isRead: boolOr(json['isRead']),
      isArchived: boolOr(json['isArchived']),
      notes: stringOrNull(json['notes']),
      serviceTitle: stringOrNull(service['title']),
      assignedToName: stringOrNull(assignee['name']),
      createdAt: dateOrNull(json['createdAt']),
      updatedAt: dateOrNull(json['updatedAt']),
    );
  }
}
