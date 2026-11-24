import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/common.dart';

class NotificationsInboxScreen extends ConsumerStatefulWidget {
  const NotificationsInboxScreen({super.key});

  @override
  ConsumerState<NotificationsInboxScreen> createState() =>
      _NotificationsInboxScreenState();
}

class _NotificationsInboxScreenState
    extends ConsumerState<NotificationsInboxScreen> {
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _items = const [];
  int _unread = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final response = await ref.read(apiClientProvider).get('/auth/notifications');
      final data = response.asMap;
      final raw = data['data'];
      final list = raw is List ? raw : const [];
      _items = list
          .whereType<Map<String, dynamic>>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
      final meta = data['meta'];
      _unread = meta is Map ? (meta['unread'] as num?)?.toInt() ?? 0 : 0;
    } on ApiException catch (error) {
      _error = error.message;
    } catch (_) {
      _error = 'Could not load notifications.';
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _markRead(int id) async {
    try {
      await ref.read(apiClientProvider).post('/auth/notifications/$id/read');
      setState(() {
        _items = _items.map((item) {
          if (item['id'] == id) {
            return {...item, 'read': true};
          }
          return item;
        }).toList();
        if (_unread > 0) _unread -= 1;
      });
    } catch (_) {
      // Best-effort.
    }
  }

  Future<void> _markAllRead() async {
    try {
      await ref.read(apiClientProvider).post('/auth/notifications/read-all');
      setState(() {
        _items = _items.map((item) => {...item, 'read': true}).toList();
        _unread = 0;
      });
    } catch (_) {
      // Best-effort.
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          if (_unread > 0)
            TextButton(
              onPressed: _markAllRead,
              child: const Text('Mark all read'),
            ),
        ],
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _load,
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : _error != null
                  ? Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Text(
                          _error!,
                          textAlign: TextAlign.center,
                          style: const TextStyle(color: AppColors.danger),
                        ),
                      ),
                    )
                  : _items.isEmpty
                      ? ListView(
                          children: const [
                            SizedBox(height: 80),
                            Center(
                              child: Text(
                                'No notifications yet.',
                                style: TextStyle(color: AppColors.inkMuted),
                              ),
                            ),
                          ],
                        )
                      : ListView.separated(
                          padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
                          itemCount: _items.length,
                          separatorBuilder: (_, _) =>
                              const SizedBox(height: 10),
                          itemBuilder: (context, index) {
                            final item = _items[index];
                            final read = item['read'] == true;
                            return SurfaceCard(
                              color: read
                                  ? null
                                  : AppColors.brandSoft.withValues(alpha: 0.4),
                              child: InkWell(
                                onTap: read
                                    ? null
                                    : () => _markRead(item['id'] as int),
                                child: Padding(
                                  padding: const EdgeInsets.all(12),
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Row(
                                        children: [
                                          Expanded(
                                            child: Text(
                                              (item['title'] ?? '').toString(),
                                              style: TextStyle(
                                                fontSize: 14,
                                                fontWeight: read
                                                    ? FontWeight.w600
                                                    : FontWeight.w800,
                                              ),
                                            ),
                                          ),
                                          if (!read)
                                            Container(
                                              width: 8,
                                              height: 8,
                                              decoration: const BoxDecoration(
                                                color: AppColors.brand,
                                                shape: BoxShape.circle,
                                              ),
                                            ),
                                        ],
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        (item['body'] ?? '').toString(),
                                        style: const TextStyle(
                                          fontSize: 13,
                                          height: 1.4,
                                        ),
                                      ),
                                      const SizedBox(height: 6),
                                      Text(
                                        (item['createdAt'] ?? '').toString(),
                                        style: const TextStyle(
                                          fontSize: 10.5,
                                          color: AppColors.inkMuted,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            );
                          },
                        ),
        ),
      ),
    );
  }
}
