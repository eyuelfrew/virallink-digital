import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/formatters.dart';
import '../../../shared/widgets/common.dart';
import '../../../shared/widgets/status_pill.dart';
import '../../dashboard/dashboard_providers.dart';
import '../../inbox/inbox_providers.dart';
import '../domain/inquiry.dart';
import '../inquiry_providers.dart';

const _inquiryStatuses = [
  'new',
  'contacted',
  'qualified',
  'converted',
  'closed',
];

class InquiryDetailScreen extends ConsumerStatefulWidget {
  const InquiryDetailScreen({super.key, required this.initialInquiry});

  final Inquiry initialInquiry;

  @override
  ConsumerState<InquiryDetailScreen> createState() =>
      _InquiryDetailScreenState();
}

class _InquiryDetailScreenState extends ConsumerState<InquiryDetailScreen> {
  late Inquiry _inquiry = widget.initialInquiry;
  bool _updating = false;

  bool get _canWrite =>
      ref.read(currentUserProvider)?.can('inquiry.write') ?? false;

  @override
  void initState() {
    super.initState();
    if (!_inquiry.isRead && _canWrite) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _update(isRead: true, quiet: true);
      });
    }
  }

  void _invalidateLists() {
    ref.invalidate(unreadInquiriesProvider);
    ref.invalidate(inquiryDetailProvider(_inquiry.id));
    ref.invalidate(dashboardSummaryProvider);
    ref.invalidate(inboxProvider);
  }

  Future<void> _update({
    String? status,
    bool? isRead,
    bool? isArchived,
    bool quiet = false,
  }) async {
    if (_updating) return;
    setState(() => _updating = true);

    try {
      final updated = await ref
          .read(inquiryRepositoryProvider)
          .update(
            _inquiry.id,
            status: status,
            isRead: isRead,
            isArchived: isArchived,
          );

      if (!mounted) return;
      setState(() => _inquiry = updated);
      _invalidateLists();

      if (!quiet) {
        final message = isArchived == true
            ? 'Enquiry archived.'
            : status != null
            ? 'Status changed to ${AppFormat.titleCase(status)}.'
            : isRead == true
            ? 'Marked as read.'
            : 'Enquiry updated.';
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(message)));
      }
    } on ApiException catch (error) {
      if (!mounted) return;
      if (!quiet) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(error.message)));
      }
    } catch (_) {
      if (!mounted) return;
      if (!quiet) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not update the enquiry.')),
        );
      }
    } finally {
      if (mounted) setState(() => _updating = false);
    }
  }

  Future<void> _archive() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Archive enquiry?'),
        content: const Text(
          'It will be removed from the active inbox but remains in the database.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Archive'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      await _update(isArchived: true);
      if (mounted) Navigator.of(context).pop();
    }
  }

  Future<void> _launch(String uri) async {
    final parsed = Uri.tryParse(uri);
    if (parsed == null) return;
    final ok = await launchUrl(parsed, mode: LaunchMode.externalApplication);
    if (!ok && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No app can open that link.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Enquiry'),
        actions: [
          if (_canWrite)
            IconButton(
              tooltip: _inquiry.isRead ? 'Mark as unread' : 'Mark as read',
              onPressed: _updating
                  ? null
                  : () => _update(isRead: !_inquiry.isRead),
              icon: Icon(
                _inquiry.isRead
                    ? Icons.mark_email_unread_outlined
                    : Icons.mark_email_read_outlined,
              ),
            ),
          if (_canWrite)
            IconButton(
              tooltip: 'Archive',
              onPressed: _updating ? null : _archive,
              icon: const Icon(Icons.archive_outlined),
            ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
        children: [
          SurfaceCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    AppAvatar(name: _inquiry.name, size: 44),
                    const SizedBox(width: 11),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            _inquiry.displaySubject,
                            style: const TextStyle(
                              fontSize: 17,
                              fontWeight: FontWeight.w800,
                              height: 1.3,
                              letterSpacing: -0.2,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            _inquiry.name,
                            style: const TextStyle(
                              fontSize: 12.5,
                              fontWeight: FontWeight.w600,
                              color: AppColors.inkMuted,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    StatusPill.status(_inquiry.status),
                    if (!_inquiry.isRead)
                      const StatusPill(
                        label: 'Unread',
                        tone: StatusTone.warning,
                      ),
                    if (_inquiry.isArchived)
                      const StatusPill(
                        label: 'Archived',
                        tone: StatusTone.neutral,
                      ),
                  ],
                ),
              ],
            ),
          ),
          const SectionHeader(
            title: 'Sender',
            padding: EdgeInsets.fromLTRB(2, 18, 2, 8),
          ),
          SurfaceCard(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
            child: Column(
              children: [
                InfoRow(
                  label: 'Email',
                  value: _inquiry.email,
                  icon: Icons.mail_outline,
                  valueColor: AppColors.brand,
                  onTap: () => _launch('mailto:${_inquiry.email}'),
                ),
                if (_inquiry.phone != null) ...[
                  const Divider(height: 1),
                  InfoRow(
                    label: 'Phone',
                    value: _inquiry.phone!,
                    icon: Icons.phone_outlined,
                    valueColor: AppColors.brand,
                    onTap: () => _launch('tel:${_inquiry.phone}'),
                  ),
                ],
                if (_inquiry.company != null) ...[
                  const Divider(height: 1),
                  InfoRow(
                    label: 'Company',
                    value: _inquiry.company!,
                    icon: Icons.business_outlined,
                  ),
                ],
                if (_inquiry.serviceTitle != null) ...[
                  const Divider(height: 1),
                  InfoRow(
                    label: 'Service',
                    value: _inquiry.serviceTitle!,
                    icon: Icons.design_services_outlined,
                  ),
                ],
                const Divider(height: 1),
                InfoRow(
                  label: 'Received',
                  value: AppFormat.dateTime(_inquiry.createdAt),
                  icon: Icons.schedule,
                ),
                const Divider(height: 1),
                InfoRow(
                  label: 'Assigned',
                  value: _inquiry.assignedToName ?? 'Unassigned',
                  icon: Icons.person_outline,
                ),
              ],
            ),
          ),
          if ((_inquiry.message ?? '').trim().isNotEmpty) ...[
            const SectionHeader(
              title: 'Message',
              padding: EdgeInsets.fromLTRB(2, 18, 2, 8),
            ),
            SurfaceCard(
              child: Text(
                _inquiry.message!,
                style: const TextStyle(fontSize: 13, height: 1.6),
              ),
            ),
          ],
          if ((_inquiry.notes ?? '').trim().isNotEmpty) ...[
            const SectionHeader(
              title: 'Internal notes',
              padding: EdgeInsets.fromLTRB(2, 18, 2, 8),
            ),
            SurfaceCard(
              child: Text(
                _inquiry.notes!,
                style: const TextStyle(fontSize: 12.5, height: 1.5),
              ),
            ),
          ],
          if (_canWrite) ...[
            const SectionHeader(
              title: 'Pipeline status',
              padding: EdgeInsets.fromLTRB(2, 18, 2, 8),
            ),
            SurfaceCard(
              child: Wrap(
                spacing: 7,
                runSpacing: 7,
                children: [
                  for (final status in _inquiryStatuses)
                    ChoiceChip(
                      label: Text(AppFormat.titleCase(status)),
                      selected: _inquiry.status == status,
                      showCheckmark: false,
                      onSelected: _updating
                          ? null
                          : (_) => _update(status: status),
                      labelStyle: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: _inquiry.status == status
                            ? AppColors.brand
                            : AppColors.inkMuted,
                      ),
                    ),
                ],
              ),
            ),
            if (_updating) ...[
              const SizedBox(height: 10),
              const Row(
                children: [
                  SizedBox(
                    width: 15,
                    height: 15,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                  SizedBox(width: 8),
                  Text(
                    'Saving…',
                    style: TextStyle(fontSize: 11.5, color: AppColors.inkMuted),
                  ),
                ],
              ),
            ],
          ],
        ],
      ),
    );
  }
}
