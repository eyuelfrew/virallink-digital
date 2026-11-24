import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/formatters.dart';
import '../../../shared/widgets/common.dart';
import '../../../shared/widgets/status_pill.dart';
import '../domain/inquiry.dart';
import '../inquiry_providers.dart';
import 'inquiry_detail_screen.dart';

class InquiriesScreen extends ConsumerStatefulWidget {
  const InquiriesScreen({super.key});

  @override
  ConsumerState<InquiriesScreen> createState() => _InquiriesScreenState();
}

class _InquiriesScreenState extends ConsumerState<InquiriesScreen> {
  final _searchController = TextEditingController();
  final _scrollController = ScrollController();

  final List<Inquiry> _items = [];
  Timer? _debounce;

  int _page = 1;
  int _totalPages = 1;
  int _total = 0;
  bool _loading = true;
  bool _loadingMore = false;
  String? _error;
  String? _status;
  bool _unreadOnly = false;
  String _search = '';

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    _load(reset: true);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!_scrollController.hasClients) return;
    final position = _scrollController.position;
    if (position.pixels >= position.maxScrollExtent - 240) _load();
  }

  Future<void> _load({bool reset = false}) async {
    if (_loadingMore) return;
    if (!reset && (_page >= _totalPages || _loading)) return;

    setState(() {
      if (reset) {
        _loading = true;
        _error = null;
        _page = 1;
      } else {
        _loadingMore = true;
      }
    });

    try {
      final page = await ref
          .read(inquiryRepositoryProvider)
          .list(
            page: reset ? 1 : _page + 1,
            pageSize: 20,
            search: _search,
            status: _status,
            isRead: _unreadOnly ? false : null,
            isArchived: false,
          );

      if (!mounted) return;
      setState(() {
        if (reset) {
          _items
            ..clear()
            ..addAll(page.items);
        } else {
          _items.addAll(page.items);
        }
        _page = page.page;
        _totalPages = page.totalPages;
        _total = page.total;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _error = error.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Could not load enquiries.');
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
          _loadingMore = false;
        });
      }
    }
  }

  void _searchChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () {
      if (!mounted) return;
      setState(() => _search = value.trim());
      _load(reset: true);
    });
  }

  void _selectFilter({String? status, bool unreadOnly = false}) {
    setState(() {
      _status = status;
      _unreadOnly = unreadOnly;
    });
    _load(reset: true);
  }

  Future<void> _open(Inquiry inquiry) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => InquiryDetailScreen(initialInquiry: inquiry),
      ),
    );
    if (mounted) _load(reset: true);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Enquiries'),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: () => _load(reset: true),
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
            child: TextField(
              controller: _searchController,
              onChanged: _searchChanged,
              textInputAction: TextInputAction.search,
              decoration: InputDecoration(
                hintText: 'Search sender, company or subject',
                prefixIcon: const Icon(Icons.search, size: 20),
                suffixIcon: _searchController.text.isEmpty
                    ? null
                    : IconButton(
                        tooltip: 'Clear search',
                        onPressed: () {
                          _searchController.clear();
                          _searchChanged('');
                        },
                        icon: const Icon(Icons.close, size: 18),
                      ),
              ),
            ),
          ),
          SizedBox(
            height: 36,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              children: [
                _FilterChip(
                  label: 'All',
                  selected: !_unreadOnly && _status == null,
                  onTap: () => _selectFilter(),
                ),
                const SizedBox(width: 6),
                _FilterChip(
                  label: 'Unread',
                  selected: _unreadOnly,
                  onTap: () => _selectFilter(unreadOnly: true),
                ),
                for (final status in const [
                  'new',
                  'contacted',
                  'qualified',
                  'converted',
                  'closed',
                ]) ...[
                  const SizedBox(width: 6),
                  _FilterChip(
                    label: AppFormat.titleCase(status),
                    selected: _status == status,
                    onTap: () => _selectFilter(status: status),
                  ),
                ],
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 6),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                _loading
                    ? 'Loading…'
                    : '$_total enquir${_total == 1 ? 'y' : 'ies'}',
                style: const TextStyle(
                  fontSize: 11.5,
                  color: AppColors.inkMuted,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
          Expanded(child: _buildList()),
        ],
      ),
    );
  }

  Widget _buildList() {
    if (_loading) return const LoadingView(label: 'Loading enquiries');
    if (_error != null && _items.isEmpty) {
      return ErrorState(message: _error!, onRetry: () => _load(reset: true));
    }
    if (_items.isEmpty) {
      return const EmptyState(
        title: 'No enquiries found',
        message: 'New contact-form messages will appear here.',
        icon: Icons.inbox_outlined,
      );
    }

    return RefreshIndicator(
      onRefresh: () => _load(reset: true),
      child: ListView.builder(
        controller: _scrollController,
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
        itemCount: _items.length + 1,
        itemBuilder: (context, index) {
          if (index == _items.length) {
            if (_loadingMore) {
              return const Padding(
                padding: EdgeInsets.all(18),
                child: Center(
                  child: SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                ),
              );
            }
            if (_page >= _totalPages) return const SizedBox(height: 12);
            return Padding(
              padding: const EdgeInsets.only(top: 8),
              child: OutlinedButton(
                onPressed: _load,
                child: const Text('Load more'),
              ),
            );
          }

          final inquiry = _items[index];
          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _InquiryTile(inquiry: inquiry, onTap: () => _open(inquiry)),
          );
        },
      ),
    );
  }
}

class _InquiryTile extends StatelessWidget {
  const _InquiryTile({required this.inquiry, required this.onTap});

  final Inquiry inquiry;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SurfaceCard(
      padding: const EdgeInsets.all(13),
      onTap: onTap,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 5),
            child: Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(
                color: inquiry.isRead ? AppColors.line : AppColors.accent,
                shape: BoxShape.circle,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        inquiry.displaySubject,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: inquiry.isRead
                              ? FontWeight.w600
                              : FontWeight.w800,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      AppFormat.relative(inquiry.createdAt),
                      style: const TextStyle(
                        fontSize: 10.5,
                        color: AppColors.inkMuted,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 3),
                Text(
                  [
                    inquiry.name,
                    if (inquiry.company != null) inquiry.company!,
                  ].join(' · '),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 11.5,
                    color: AppColors.inkMuted,
                  ),
                ),
                const SizedBox(height: 7),
                Row(
                  children: [
                    StatusPill.status(inquiry.status, compact: true),
                    if (inquiry.serviceTitle != null) ...[
                      const SizedBox(width: 7),
                      Flexible(
                        child: MetaText(
                          inquiry.serviceTitle!,
                          icon: Icons.design_services_outlined,
                        ),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: 5),
          const Icon(Icons.chevron_right, size: 18, color: AppColors.inkMuted),
        ],
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ChoiceChip(
      label: Text(label),
      selected: selected,
      showCheckmark: false,
      onSelected: (_) => onTap(),
      labelStyle: TextStyle(
        fontSize: 12,
        fontWeight: FontWeight.w600,
        color: selected ? AppColors.brand : AppColors.inkMuted,
      ),
    );
  }
}
