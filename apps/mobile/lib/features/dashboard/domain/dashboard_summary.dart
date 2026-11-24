import '../../../core/utils/json.dart';
import '../../activity/domain/activity_entry.dart';
import '../../inquiries/domain/inquiry.dart';

class DashboardCounts {
  const DashboardCounts({
    required this.clientsTotal,
    required this.clientsActive,
    required this.projectsTotal,
    required this.projectsActive,
    required this.projectsCompleted,
    required this.employees,
    required this.shareholders,
    required this.unreadInquiries,
  });

  final int clientsTotal;
  final int clientsActive;
  final int projectsTotal;
  final int projectsActive;
  final int projectsCompleted;
  final int employees;
  final int shareholders;
  final int unreadInquiries;

  factory DashboardCounts.fromJson(Map<String, dynamic> json) {
    final clients = mapOr(json['clients']);
    final projects = mapOr(json['projects']);
    final inquiries = mapOr(json['inquiries']);
    return DashboardCounts(
      clientsTotal: intOr(clients['total']),
      clientsActive: intOr(clients['active']),
      projectsTotal: intOr(projects['total']),
      projectsActive: intOr(projects['active']),
      projectsCompleted: intOr(projects['completed']),
      employees: intOr(json['employees']),
      shareholders: intOr(json['shareholders']),
      unreadInquiries: intOr(inquiries['unread']),
    );
  }

  bool get isFirstRun =>
      clientsTotal == 0 &&
      projectsTotal == 0 &&
      employees == 0 &&
      unreadInquiries == 0;
}

class FinanceBlock {
  const FinanceBlock({
    required this.incomeCents,
    required this.expenseCents,
    required this.profitCents,
  });

  final int incomeCents;
  final int expenseCents;
  final int profitCents;

  factory FinanceBlock.fromJson(Map<String, dynamic> json) {
    return FinanceBlock(
      incomeCents: intOr(json['incomeCents']),
      expenseCents: intOr(json['expenseCents']),
      profitCents: intOr(json['profitCents']),
    );
  }
}

class DashboardFinance {
  const DashboardFinance({
    required this.currency,
    required this.month,
    required this.lifetime,
    required this.outstandingCents,
  });

  final String currency;
  final FinanceBlock month;
  final FinanceBlock lifetime;
  final int outstandingCents;

  factory DashboardFinance.fromJson(Map<String, dynamic> json) {
    return DashboardFinance(
      currency: stringOr(json['currency'], 'ETB'),
      month: FinanceBlock.fromJson(mapOr(json['month'])),
      lifetime: FinanceBlock.fromJson(mapOr(json['lifetime'])),
      outstandingCents: intOr(json['outstandingCents']),
    );
  }
}

class TrendPoint {
  const TrendPoint({
    required this.month,
    required this.label,
    required this.incomeCents,
    required this.expenseCents,
    required this.profitCents,
  });

  final String month;
  final String label;
  final int incomeCents;
  final int expenseCents;
  final int profitCents;

  factory TrendPoint.fromJson(Map<String, dynamic> json) {
    return TrendPoint(
      month: stringOr(json['month']),
      label: stringOr(json['label']),
      incomeCents: intOr(json['incomeCents']),
      expenseCents: intOr(json['expenseCents']),
      profitCents: intOr(json['profitCents']),
    );
  }
}

class StatusCount {
  const StatusCount({required this.status, required this.count});

  final String status;
  final int count;

  factory StatusCount.fromJson(Map<String, dynamic> json) {
    return StatusCount(
      status: stringOr(json['status'], 'unknown'),
      count: intOr(json['count']),
    );
  }
}

class DeadlineItem {
  const DeadlineItem({
    required this.type,
    required this.id,
    required this.label,
    required this.status,
    this.dueDate,
    this.outstandingCents = 0,
  });

  final String type;
  final int id;
  final String label;
  final String status;
  final DateTime? dueDate;
  final int outstandingCents;

  bool get isInvoice => type == 'invoice';

  factory DeadlineItem.fromJson(Map<String, dynamic> json) {
    return DeadlineItem(
      type: stringOr(json['type'], 'project'),
      id: intOr(json['id']),
      label: stringOr(json['label'], 'Untitled'),
      status: stringOr(json['status']),
      dueDate: dateOrNull(json['dueDate']),
      outstandingCents: intOr(json['outstandingCents']),
    );
  }
}

class ServiceShare {
  const ServiceShare({
    required this.serviceId,
    required this.title,
    required this.count,
  });

  final int serviceId;
  final String title;
  final int count;

  factory ServiceShare.fromJson(Map<String, dynamic> json) {
    return ServiceShare(
      serviceId: intOr(json['serviceId']),
      title: stringOr(json['title'], 'Unassigned'),
      count: intOr(json['count']),
    );
  }
}

class DashboardSummary {
  const DashboardSummary({
    required this.counts,
    required this.finance,
    required this.trends,
    required this.projectStatuses,
    required this.clientStatuses,
    required this.recentActivity,
    required this.recentInquiries,
    required this.deadlines,
    required this.serviceDistribution,
  });

  final DashboardCounts counts;
  final DashboardFinance finance;
  final List<TrendPoint> trends;
  final List<StatusCount> projectStatuses;
  final List<StatusCount> clientStatuses;
  final List<ActivityEntry> recentActivity;
  final List<Inquiry> recentInquiries;
  final List<DeadlineItem> deadlines;
  final List<ServiceShare> serviceDistribution;

  factory DashboardSummary.fromJson(Map<String, dynamic> json) {
    final breakdown = mapOr(json['statusBreakdown']);

    return DashboardSummary(
      counts: DashboardCounts.fromJson(mapOr(json['counts'])),
      finance: DashboardFinance.fromJson(mapOr(json['finance'])),
      trends: mapsOr(json['trends']).map(TrendPoint.fromJson).toList(),
      projectStatuses: mapsOr(
        breakdown['projects'],
      ).map(StatusCount.fromJson).toList(),
      clientStatuses: mapsOr(
        breakdown['clients'],
      ).map(StatusCount.fromJson).toList(),
      recentActivity: mapsOr(
        json['recentActivity'],
      ).map(ActivityEntry.fromJson).toList(),
      recentInquiries: mapsOr(
        json['recentInquiries'],
      ).map(Inquiry.fromJson).toList(),
      deadlines: mapsOr(json['deadlines']).map(DeadlineItem.fromJson).toList(),
      serviceDistribution: mapsOr(
        json['serviceDistribution'],
      ).map(ServiceShare.fromJson).toList(),
    );
  }
}
