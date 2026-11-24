import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/formatters.dart';
import '../../../shared/widgets/common.dart';
import '../activity_providers.dart';
import '../domain/activity_entry.dart';

class ActivityScreen extends ConsumerStatefulWidget {
  const ActivityScreen({super.key});

  @override
  ConsumerState<ActivityScreen> createState() => _ActivityScreenState();
}

class _ActivityScreenState extends ConsumerState<ActivityScreen> {
  final _scrollController = ScrollController();
  final List<ActivityEntry> _items = [];

  int _page = 1;
  int _totalPages = 1;
  int _total = 0;
  bool _loading = true;
  bool _loadingMore = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    _load(reset: true);
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!_scrollController.hasClients) return;
    final position = _scrollController.position;
    if (position.pixels >= position.maxScrollExtent - 200) _load();
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
          .read(activityRepositoryProvider)
          .list(page: reset ? 1 : _page + 1, pageSize: 30);

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
      setState(() => _error = 'Could not load the activity log.');
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
          _loadingMore = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Activity log'),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: () => _load(reset: true),
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading) return const LoadingView(label: 'Loading activity');
    if (_error != null && _items.isEmpty) {
      return ErrorState(message: _error!, onRetry: () => _load(reset: true));
    }
    if (_items.isEmpty) {
      return const EmptyState(
        title: 'No activity yet',
        message: 'Mutations made in the admin or mobile app are recorded here.',
        icon: Icons.history,
      );
    }

    return RefreshIndicator(
      onRefresh: () => _load(reset: true),
      child: ListView.builder(
        controller: _scrollController,
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
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
            if (_page >= _totalPages) {
              return Padding(
                padding: const EdgeInsets.only(top: 14),
                child: Center(
                  child: Text(
                    '$_total event${_total == 1 ? '' : 's'}',
                    style: const TextStyle(
                      fontSize: 11,
                      color: AppColors.inkMuted,
                    ),
                  ),
                ),
              );
            }
            return Padding(
              padding: const EdgeInsets.only(top: 8),
              child: OutlinedButton(
                onPressed: _load,
                child: const Text('Load more'),
              ),
            );
          }

          return _ActivityTile(entry: _items[index]);
        },
      ),
    );
  }
}

class _ActivityTile extends StatelessWidget {
  const _ActivityTile({required this.entry});

  final ActivityEntry entry;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: SurfaceCard(
        padding: const EdgeInsets.all(13),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 30,
              height: 30,
              decoration: BoxDecoration(
                color: AppColors.brandSoft,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(
                _iconFor(entry.action),
                size: 15,
                color: AppColors.brand,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${AppFormat.titleCase(entry.action)} '
                    '${entry.entity.replaceAll('_', ' ')}',
                    style: const TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    [
                      if (entry.userName != null)
                        entry.userName!
                      else if (entry.userEmail != null)
                        entry.userEmail!,
                      if (entry.entityId != null) '#${entry.entityId}',
                    ].join(' · '),
                    style: const TextStyle(
                      fontSize: 11,
                      color: AppColors.inkMuted,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Text(
              AppFormat.relative(entry.createdAt),
              style: const TextStyle(fontSize: 10.5, color: AppColors.inkMuted),
            ),
          ],
        ),
      ),
    );
  }

  IconData _iconFor(String action) {
    switch (action) {
      case 'login':
        return Icons.login;
      case 'create':
      case 'financial_create':
        return Icons.add_circle_outline;
      case 'delete':
      case 'financial_delete':
        return Icons.delete_outline;
      case 'publish':
      case 'unpublish':
        return Icons.public;
      case 'archive':
        return Icons.archive_outlined;
      default:
        return Icons.edit_outlined;
    }
  }
}
