import '../../../core/utils/json.dart';

class InvoiceItem {
  const InvoiceItem({
    required this.id,
    required this.description,
    required this.quantity,
    required this.unitPrice,
    required this.lineTotal,
  });

  final int id;
  final String description;
  final double quantity;
  final double unitPrice;
  final double lineTotal;

  factory InvoiceItem.fromJson(Map<String, dynamic> json) {
    return InvoiceItem(
      id: intOr(json['id']),
      description: stringOr(json['description'], 'Line item'),
      quantity: doubleOr(json['quantity']),
      unitPrice: doubleOr(json['unitPrice']),
      lineTotal: doubleOr(json['lineTotal']),
    );
  }
}

class InvoicePayment {
  const InvoicePayment({
    required this.id,
    required this.amount,
    required this.method,
    this.reference,
    this.paidAt,
    this.notes,
  });

  final int id;
  final double amount;
  final String method;
  final String? reference;
  final DateTime? paidAt;
  final String? notes;

  factory InvoicePayment.fromJson(Map<String, dynamic> json) {
    return InvoicePayment(
      id: intOr(json['id']),
      amount: doubleOr(json['amount']),
      method: stringOr(json['method'], 'other'),
      reference: stringOrNull(json['reference']),
      paidAt: dateOrNull(json['paidAt']),
      notes: stringOrNull(json['notes']),
    );
  }
}

class Invoice {
  const Invoice({
    required this.id,
    required this.invoiceNumber,
    required this.status,
    required this.currency,
    required this.items,
    required this.payments,
    this.clientId,
    this.clientName,
    this.clientEmail,
    this.projectTitle,
    this.issueDate,
    this.dueDate,
    this.taxRate,
    this.subtotal,
    this.taxAmount,
    this.total,
    this.paidAmount,
    this.outstanding,
    this.notes,
  });

  final int id;
  final String invoiceNumber;
  final String status;
  final String currency;
  final int? clientId;
  final String? clientName;
  final String? clientEmail;
  final String? projectTitle;
  final DateTime? issueDate;
  final DateTime? dueDate;
  final double? taxRate;
  final double? subtotal;
  final double? taxAmount;
  final double? total;
  final double? paidAmount;
  final double? outstanding;
  final String? notes;
  final List<InvoiceItem> items;
  final List<InvoicePayment> payments;

  bool get isOverdue {
    if (dueDate == null) return false;
    if (status == 'paid' || status == 'void') return false;
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

  factory Invoice.fromJson(Map<String, dynamic> json) {
    final client = mapOr(json['client']);
    final project = mapOr(json['project']);
    return Invoice(
      id: intOr(json['id']),
      invoiceNumber: stringOr(json['invoiceNumber'], 'Invoice'),
      status: stringOr(json['status'], 'draft'),
      currency: stringOr(json['currency'], 'ETB'),
      clientId: intOrNull(json['clientId']),
      clientName: stringOrNull(client['name']),
      clientEmail: stringOrNull(client['email']),
      projectTitle: stringOrNull(project['title']),
      issueDate: dateOrNull(json['issueDate']),
      dueDate: dateOrNull(json['dueDate']),
      taxRate: doubleOrNull(json['taxRate']),
      subtotal: doubleOrNull(json['subtotal']),
      taxAmount: doubleOrNull(json['taxAmount']),
      total: doubleOrNull(json['total']),
      paidAmount: doubleOrNull(json['paidAmount']),
      outstanding: doubleOrNull(json['outstanding']),
      notes: stringOrNull(json['notes']),
      items: mapsOr(json['items']).map(InvoiceItem.fromJson).toList(),
      payments: mapsOr(json['payments']).map(InvoicePayment.fromJson).toList(),
    );
  }
}
