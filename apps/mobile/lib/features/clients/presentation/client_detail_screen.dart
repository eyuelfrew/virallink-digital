import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/utils/formatters.dart';
import '../../../shared/widgets/async_value_view.dart';
import '../../../shared/widgets/common.dart';
import '../../../shared/widgets/status_pill.dart';
import '../../invoices/presentation/invoice_detail_screen.dart';
import '../client_providers.dart';
import '../domain/client.dart';
import 'widgets/client_logo.dart';

class ClientDetailScreen extends ConsumerWidget {
  const ClientDetailScreen({super.key, required this.clientId});

  final int clientId;

  Future<void> _launch(BuildContext context, String? uri) async {
    if (uri == null || uri.isEmpty) return;
    final parsed = Uri.tryParse(uri);
    if (parsed == null) return;

    final ok = await launchUrl(parsed, mode: LaunchMode.externalApplication);
    if (!ok && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No app can open that link.')),
      );
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detail = ref.watch(clientDetailProvider(clientId));

    Future<void> refresh() async {
      ref.invalidate(clientDetailProvider(clientId));
      try {
        await ref.read(clientDetailProvider(clientId).future);
      } catch (_) {}
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Client'),
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
        child: AsyncValueView<Client>(
          value: detail,
          onRefresh: refresh,
          loadingLabel: 'Loading client',
          builder: (client) {
            return ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
              children: [
                SurfaceCard(
                  child: Row(
                    children: [
                      ClientLogo(client: client, size: 54),
                      const SizedBox(width: 13),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              client.name,
                              style: const TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.w800,
                                letterSpacing: -0.3,
                                height: 1.25,
                              ),
                            ),
                            const SizedBox(height: 5),
                            Wrap(
                              spacing: 6,
                              runSpacing: 6,
                              children: [
                                StatusPill.status(client.status),
                                if (client.industry != null)
                                  StatusPill(
                                    label: client.industry!,
                                    tone: StatusTone.neutral,
                                  ),
                                if (client.isPublic)
                                  const StatusPill(
                                    label: 'Public',
                                    tone: StatusTone.info,
                                  ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SectionHeader(
                  title: 'Contact',
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
                        label: 'Contact',
                        value: client.contactPerson ?? '—',
                        icon: Icons.person_outline,
                      ),
                      if (client.email != null) ...[
                        const Divider(height: 1),
                        InfoRow(
                          label: 'Email',
                          value: client.email!,
                          icon: Icons.mail_outline,
                          valueColor: AppColors.brand,
                          onTap: () =>
                              _launch(context, 'mailto:${client.email}'),
                        ),
                      ],
                      if (client.phone != null) ...[
                        const Divider(height: 1),
                        InfoRow(
                          label: 'Phone',
                          value: client.phone!,
                          icon: Icons.phone_outlined,
                          valueColor: AppColors.brand,
                          onTap: () => _launch(context, 'tel:${client.phone}'),
                        ),
                      ],
                      if (client.website != null) ...[
                        const Divider(height: 1),
                        InfoRow(
                          label: 'Website',
                          value: client.website!,
                          icon: Icons.language,
                          valueColor: AppColors.brand,
                          onTap: () {
                            final site = client.website!;
                            _launch(
                              context,
                              site.startsWith('http') ? site : 'https://$site',
                            );
                          },
                        ),
                      ],
                      const Divider(height: 1),
                      InfoRow(
                        label: 'Location',
                        value: [
                          if (client.addressLine1 != null) client.addressLine1!,
                          if (client.city != null) client.city!,
                          if (client.country != null) client.country!,
                        ].join(', '),
                        icon: Icons.place_outlined,
                      ),
                      const Divider(height: 1),
                      InfoRow(
                        label: 'Contract',
                        value: client.contractValue == null
                            ? '—'
                            : AppFormat.money(client.contractValue),
                        icon: Icons.payments_outlined,
                      ),
                      const Divider(height: 1),
                      InfoRow(
                        label: 'Since',
                        value: AppFormat.date(client.createdAt),
                        icon: Icons.calendar_today_outlined,
                      ),
                    ],
                  ),
                ),
                if (client.projects.isNotEmpty) ...[
                  const SectionHeader(
                    title: 'Projects',
                    padding: EdgeInsets.fromLTRB(2, 18, 2, 8),
                  ),
                  SurfaceCard(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 4,
                    ),
                    child: Column(
                      children: [
                        for (var i = 0; i < client.projects.length; i++) ...[
                          _ProjectRow(project: client.projects[i]),
                          if (i < client.projects.length - 1)
                            const Divider(height: 1),
                        ],
                      ],
                    ),
                  ),
                ],
                if (client.invoices.isNotEmpty) ...[
                  const SectionHeader(
                    title: 'Invoices',
                    padding: EdgeInsets.fromLTRB(2, 18, 2, 8),
                  ),
                  Column(
                    children: [
                      for (final invoice in client.invoices)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: SurfaceCard(
                            padding: const EdgeInsets.all(13),
                            onTap: () => Navigator.of(context).push(
                              MaterialPageRoute<void>(
                                builder: (_) =>
                                    InvoiceDetailScreen(invoiceId: invoice.id),
                              ),
                            ),
                            child: Row(
                              children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        invoice.invoiceNumber,
                                        style: const TextStyle(
                                          fontSize: 13,
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                      const SizedBox(height: 3),
                                      Text(
                                        'Issued ${AppFormat.date(invoice.issueDate)} · Due ${AppFormat.date(invoice.dueDate)}',
                                        style: const TextStyle(
                                          fontSize: 11,
                                          color: AppColors.inkMuted,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.end,
                                  children: [
                                    Text(
                                      AppFormat.money(
                                        invoice.total,
                                        currency: invoice.currency,
                                      ),
                                      style: const TextStyle(
                                        fontSize: 12.5,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                    const SizedBox(height: 4),
                                    StatusPill.status(
                                      invoice.status,
                                      compact: true,
                                    ),
                                  ],
                                ),
                                const SizedBox(width: 4),
                                const Icon(
                                  Icons.chevron_right,
                                  size: 17,
                                  color: AppColors.inkMuted,
                                ),
                              ],
                            ),
                          ),
                        ),
                    ],
                  ),
                ],
                if (client.notes.isNotEmpty) ...[
                  const SectionHeader(
                    title: 'Internal notes',
                    padding: EdgeInsets.fromLTRB(2, 18, 2, 8),
                  ),
                  Column(
                    children: [
                      for (final note in client.notes)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: SurfaceCard(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  note.body,
                                  style: const TextStyle(
                                    fontSize: 12.5,
                                    height: 1.5,
                                  ),
                                ),
                                const SizedBox(height: 7),
                                Text(
                                  [
                                    if (note.authorName != null)
                                      note.authorName!,
                                    AppFormat.relative(note.createdAt),
                                  ].join(' · '),
                                  style: const TextStyle(
                                    fontSize: 10.5,
                                    color: AppColors.inkMuted,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                    ],
                  ),
                ],
                if (client.communications.isNotEmpty) ...[
                  const SectionHeader(
                    title: 'Communication log',
                    padding: EdgeInsets.fromLTRB(2, 18, 2, 8),
                  ),
                  Column(
                    children: [
                      for (final communication in client.communications)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: SurfaceCard(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    StatusPill(
                                      label: AppFormat.titleCase(
                                        communication.type,
                                      ),
                                      tone: StatusTone.neutral,
                                      compact: true,
                                    ),
                                    const SizedBox(width: 8),
                                    Text(
                                      AppFormat.dateTime(
                                        communication.occurredAt,
                                      ),
                                      style: const TextStyle(
                                        fontSize: 10.5,
                                        color: AppColors.inkMuted,
                                      ),
                                    ),
                                  ],
                                ),
                                if (communication.subject != null) ...[
                                  const SizedBox(height: 7),
                                  Text(
                                    communication.subject!,
                                    style: const TextStyle(
                                      fontSize: 12.5,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ],
                                const SizedBox(height: 4),
                                Text(
                                  communication.body,
                                  style: const TextStyle(
                                    fontSize: 12.5,
                                    height: 1.5,
                                  ),
                                ),
                                if (communication.authorName != null) ...[
                                  const SizedBox(height: 6),
                                  Text(
                                    'Logged by ${communication.authorName}',
                                    style: const TextStyle(
                                      fontSize: 10.5,
                                      color: AppColors.inkMuted,
                                    ),
                                  ),
                                ],
                              ],
                            ),
                          ),
                        ),
                    ],
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

class _ProjectRow extends StatelessWidget {
  const _ProjectRow({required this.project});

  final ClientProject project;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  project.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (project.serviceTitle != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    project.serviceTitle!,
                    style: const TextStyle(
                      fontSize: 10.5,
                      color: AppColors.inkMuted,
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 8),
          StatusPill.status(project.status, compact: true),
        ],
      ),
    );
  }
}
