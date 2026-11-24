import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/utils/formatters.dart';
import '../../../shared/widgets/async_value_view.dart';
import '../../../shared/widgets/common.dart';
import '../../../shared/widgets/status_pill.dart';
import '../domain/invoice.dart';
import '../invoice_providers.dart';

class InvoiceDetailScreen extends ConsumerWidget {
  const InvoiceDetailScreen({super.key, required this.invoiceId});

  final int invoiceId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detail = ref.watch(invoiceDetailProvider(invoiceId));

    Future<void> refresh() async {
      ref.invalidate(invoiceDetailProvider(invoiceId));
      try {
        await ref.read(invoiceDetailProvider(invoiceId).future);
      } catch (_) {}
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Invoice'),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: refresh,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: refresh,
        child: AsyncValueView<Invoice>(
          value: detail,
          onRefresh: refresh,
          loadingLabel: 'Loading invoice',
          builder: (invoice) {
            return ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
              children: [
                SurfaceCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              invoice.invoiceNumber,
                              style: const TextStyle(
                                fontSize: 19,
                                fontWeight: FontWeight.w800,
                                letterSpacing: -0.3,
                              ),
                            ),
                          ),
                          StatusPill.status(invoice.status),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Text(
                        [
                          if (invoice.clientName != null) invoice.clientName!,
                          if (invoice.projectTitle != null)
                            invoice.projectTitle!,
                        ].join(' · '),
                        style: const TextStyle(
                          fontSize: 12.5,
                          color: AppColors.inkMuted,
                        ),
                      ),
                      const SizedBox(height: 16),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Expanded(
                            child: _MoneyBlock(
                              label: 'Total',
                              value: AppFormat.money(
                                invoice.total,
                                currency: invoice.currency,
                              ),
                            ),
                          ),
                          Expanded(
                            child: _MoneyBlock(
                              label: 'Paid',
                              value: AppFormat.money(
                                invoice.paidAmount,
                                currency: invoice.currency,
                              ),
                              color: AppColors.success,
                            ),
                          ),
                          Expanded(
                            child: _MoneyBlock(
                              label: 'Outstanding',
                              value: AppFormat.money(
                                invoice.outstanding,
                                currency: invoice.currency,
                              ),
                              color: (invoice.outstanding ?? 0) > 0
                                  ? AppColors.warning
                                  : AppColors.success,
                            ),
                          ),
                        ],
                      ),
                      if (invoice.isOverdue) ...[
                        const SizedBox(height: 12),
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: AppColors.dangerSoft,
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            'This invoice is past its due date (${AppFormat.date(invoice.dueDate)}).',
                            style: const TextStyle(
                              fontSize: 11.5,
                              color: AppColors.danger,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                const SectionHeader(
                  title: 'Details',
                  padding: EdgeInsets.fromLTRB(2, 18, 2, 8),
                ),
                SurfaceCard(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 4,
                  ),
                  child: Column(
                    children: [
                      InfoRow(
                        label: 'Client',
                        value: invoice.clientName ?? '—',
                        icon: Icons.business_outlined,
                      ),
                      if (invoice.clientEmail != null) ...[
                        const Divider(height: 1),
                        InfoRow(
                          label: 'Email',
                          value: invoice.clientEmail!,
                          icon: Icons.mail_outline,
                        ),
                      ],
                      const Divider(height: 1),
                      InfoRow(
                        label: 'Issued',
                        value: AppFormat.date(invoice.issueDate),
                        icon: Icons.event_outlined,
                      ),
                      const Divider(height: 1),
                      InfoRow(
                        label: 'Due',
                        value: AppFormat.date(invoice.dueDate),
                        icon: Icons.event_available_outlined,
                        valueColor: invoice.isOverdue ? AppColors.danger : null,
                      ),
                      if (invoice.projectTitle != null) ...[
                        const Divider(height: 1),
                        InfoRow(
                          label: 'Project',
                          value: invoice.projectTitle!,
                          icon: Icons.folder_outlined,
                        ),
                      ],
                      if (invoice.taxRate != null) ...[
                        const Divider(height: 1),
                        InfoRow(
                          label: 'Tax rate',
                          value: '${invoice.taxRate}%',
                          icon: Icons.percent,
                        ),
                      ],
                    ],
                  ),
                ),
                if (invoice.items.isNotEmpty) ...[
                  const SectionHeader(
                    title: 'Line items',
                    padding: EdgeInsets.fromLTRB(2, 18, 2, 8),
                  ),
                  SurfaceCard(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 4,
                    ),
                    child: Column(
                      children: [
                        for (var i = 0; i < invoice.items.length; i++) ...[
                          _ItemRow(
                            item: invoice.items[i],
                            currency: invoice.currency,
                          ),
                          if (i < invoice.items.length - 1)
                            const Divider(height: 1),
                        ],
                        const Divider(height: 1),
                        _TotalsRow(
                          label: 'Subtotal',
                          value: AppFormat.money(
                            invoice.subtotal,
                            currency: invoice.currency,
                          ),
                        ),
                        if ((invoice.taxAmount ?? 0) != 0)
                          _TotalsRow(
                            label: 'Tax',
                            value: AppFormat.money(
                              invoice.taxAmount,
                              currency: invoice.currency,
                            ),
                          ),
                        _TotalsRow(
                          label: 'Total',
                          value: AppFormat.money(
                            invoice.total,
                            currency: invoice.currency,
                          ),
                          emphasized: true,
                        ),
                      ],
                    ),
                  ),
                ],
                if (invoice.payments.isNotEmpty) ...[
                  const SectionHeader(
                    title: 'Payments',
                    padding: EdgeInsets.fromLTRB(2, 18, 2, 8),
                  ),
                  SurfaceCard(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 4,
                    ),
                    child: Column(
                      children: [
                        for (var i = 0; i < invoice.payments.length; i++) ...[
                          _PaymentRow(
                            payment: invoice.payments[i],
                            currency: invoice.currency,
                          ),
                          if (i < invoice.payments.length - 1)
                            const Divider(height: 1),
                        ],
                      ],
                    ),
                  ),
                ],
                if ((invoice.notes ?? '').trim().isNotEmpty) ...[
                  const SectionHeader(
                    title: 'Notes',
                    padding: EdgeInsets.fromLTRB(2, 18, 2, 8),
                  ),
                  SurfaceCard(
                    child: Text(
                      invoice.notes!,
                      style: const TextStyle(fontSize: 12.5, height: 1.5),
                    ),
                  ),
                ],
              ],
            );
          },
        ),
      ),
    );
  }
}

class _MoneyBlock extends StatelessWidget {
  const _MoneyBlock({required this.label, required this.value, this.color});

  final String label;
  final String value;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            fontSize: 10.5,
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
            fontSize: 13.5,
            fontWeight: FontWeight.w800,
            color: color ?? AppColors.ink,
            letterSpacing: -0.2,
          ),
        ),
      ],
    );
  }
}

class _ItemRow extends StatelessWidget {
  const _ItemRow({required this.item, required this.currency});

  final InvoiceItem item;
  final String currency;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.description,
                  style: const TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                    height: 1.35,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '${AppFormat.number(item.quantity)} × ${AppFormat.money(item.unitPrice, currency: currency)}',
                  style: const TextStyle(
                    fontSize: 10.5,
                    color: AppColors.inkMuted,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Text(
            AppFormat.money(item.lineTotal, currency: currency),
            style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}

class _TotalsRow extends StatelessWidget {
  const _TotalsRow({
    required this.label,
    required this.value,
    this.emphasized = false,
  });

  final String label;
  final String value;
  final bool emphasized;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 9),
      child: Row(
        children: [
          Text(
            label,
            style: TextStyle(
              fontSize: emphasized ? 12.5 : 11.5,
              fontWeight: emphasized ? FontWeight.w800 : FontWeight.w500,
              color: emphasized ? AppColors.ink : AppColors.inkMuted,
            ),
          ),
          const Spacer(),
          Text(
            value,
            style: TextStyle(
              fontSize: emphasized ? 13.5 : 12,
              fontWeight: emphasized ? FontWeight.w800 : FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _PaymentRow extends StatelessWidget {
  const _PaymentRow({required this.payment, required this.currency});

  final InvoicePayment payment;
  final String currency;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        children: [
          Container(
            width: 30,
            height: 30,
            decoration: BoxDecoration(
              color: AppColors.successSoft,
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Icon(
              Icons.south_west,
              size: 15,
              color: AppColors.success,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  AppFormat.titleCase(payment.method),
                  style: const TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  [
                    AppFormat.date(payment.paidAt),
                    if (payment.reference != null) payment.reference!,
                  ].join(' · '),
                  style: const TextStyle(
                    fontSize: 10.5,
                    color: AppColors.inkMuted,
                  ),
                ),
              ],
            ),
          ),
          Text(
            AppFormat.money(payment.amount, currency: currency),
            style: const TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w700,
              color: AppColors.success,
            ),
          ),
        ],
      ),
    );
  }
}
