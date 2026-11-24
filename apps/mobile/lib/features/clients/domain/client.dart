import '../../../core/config/app_config.dart';
import '../../../core/utils/json.dart';

class ClientProject {
  const ClientProject({
    required this.id,
    required this.title,
    required this.status,
    this.summary,
    this.deadlineAt,
    this.serviceTitle,
  });

  final int id;
  final String title;
  final String status;
  final String? summary;
  final DateTime? deadlineAt;
  final String? serviceTitle;

  factory ClientProject.fromJson(Map<String, dynamic> json) {
    final service = mapOr(json['service']);
    return ClientProject(
      id: intOr(json['id']),
      title: stringOr(json['title'], 'Untitled project'),
      status: stringOr(json['status'], 'planning'),
      summary: stringOrNull(json['summary']),
      deadlineAt: dateOrNull(json['deadlineAt']),
      serviceTitle: stringOrNull(service['title']),
    );
  }
}

class ClientNote {
  const ClientNote({
    required this.id,
    required this.body,
    this.authorName,
    this.createdAt,
  });

  final int id;
  final String body;
  final String? authorName;
  final DateTime? createdAt;

  factory ClientNote.fromJson(Map<String, dynamic> json) {
    final author = mapOr(json['author']);
    return ClientNote(
      id: intOr(json['id']),
      body: stringOr(json['body']),
      authorName: stringOrNull(author['name']),
      createdAt: dateOrNull(json['createdAt']),
    );
  }
}

class ClientCommunication {
  const ClientCommunication({
    required this.id,
    required this.type,
    required this.body,
    this.subject,
    this.authorName,
    this.occurredAt,
  });

  final int id;
  final String type;
  final String body;
  final String? subject;
  final String? authorName;
  final DateTime? occurredAt;

  factory ClientCommunication.fromJson(Map<String, dynamic> json) {
    final author = mapOr(json['author']);
    return ClientCommunication(
      id: intOr(json['id']),
      type: stringOr(json['type'], 'other'),
      body: stringOr(json['body']),
      subject: stringOrNull(json['subject']),
      authorName: stringOrNull(author['name']),
      occurredAt: dateOrNull(json['occurredAt']),
    );
  }
}

class ClientInvoiceRef {
  const ClientInvoiceRef({
    required this.id,
    required this.invoiceNumber,
    required this.status,
    required this.currency,
    this.total,
    this.paidAmount,
    this.outstanding,
    this.issueDate,
    this.dueDate,
  });

  final int id;
  final String invoiceNumber;
  final String status;
  final String currency;
  final double? total;
  final double? paidAmount;
  final double? outstanding;
  final DateTime? issueDate;
  final DateTime? dueDate;

  factory ClientInvoiceRef.fromJson(Map<String, dynamic> json) {
    return ClientInvoiceRef(
      id: intOr(json['id']),
      invoiceNumber: stringOr(json['invoiceNumber'], 'Invoice'),
      status: stringOr(json['status'], 'draft'),
      currency: stringOr(json['currency'], 'ETB'),
      total: doubleOrNull(json['total']),
      paidAmount: doubleOrNull(json['paidAmount']),
      outstanding: doubleOrNull(json['outstanding']),
      issueDate: dateOrNull(json['issueDate']),
      dueDate: dateOrNull(json['dueDate']),
    );
  }
}

class Client {
  const Client({
    required this.id,
    required this.name,
    required this.status,
    required this.isPublic,
    required this.projects,
    required this.notes,
    required this.communications,
    required this.invoices,
    this.contactPerson,
    this.email,
    this.phone,
    this.website,
    this.industry,
    this.addressLine1,
    this.city,
    this.country,
    this.source,
    this.notesSummary,
    this.contractValue,
    this.logoUrl,
    this.createdAt,
  });

  final int id;
  final String name;
  final String? contactPerson;
  final String? email;
  final String? phone;
  final String? website;
  final String? industry;
  final String? addressLine1;
  final String? city;
  final String? country;
  final String status;
  final String? source;
  final String? notesSummary;
  final double? contractValue;
  final bool isPublic;
  final String? logoUrl;
  final DateTime? createdAt;
  final List<ClientProject> projects;
  final List<ClientNote> notes;
  final List<ClientCommunication> communications;
  final List<ClientInvoiceRef> invoices;

  String get location {
    final parts = [
      city,
      country,
    ].where((part) => part != null && part.isNotEmpty);
    return parts.join(', ');
  }

  factory Client.fromJson(Map<String, dynamic> json) {
    final logo = mapOr(json['logo']);
    return Client(
      id: intOr(json['id']),
      name: stringOr(json['name'], 'Unnamed client'),
      contactPerson: stringOrNull(json['contactPerson']),
      email: stringOrNull(json['email']),
      phone: stringOrNull(json['phone']),
      website: stringOrNull(json['website']),
      industry: stringOrNull(json['industry']),
      addressLine1: stringOrNull(json['addressLine1']),
      city: stringOrNull(json['city']),
      country: stringOrNull(json['country']),
      status: stringOr(json['status'], 'prospect'),
      source: stringOrNull(json['source']),
      notesSummary: stringOrNull(json['notes']),
      contractValue: doubleOrNull(json['contractValue']),
      isPublic: boolOr(json['isPublic']),
      logoUrl: AppConfig.resolveMediaUrl(stringOrNull(logo['url'])),
      createdAt: dateOrNull(json['createdAt']),
      projects: mapsOr(json['projects']).map(ClientProject.fromJson).toList(),
      notes: mapsOr(json['clientNotes']).map(ClientNote.fromJson).toList(),
      communications: mapsOr(
        json['communications'],
      ).map(ClientCommunication.fromJson).toList(),
      invoices: mapsOr(
        json['invoices'],
      ).map(ClientInvoiceRef.fromJson).toList(),
    );
  }
}
