import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/chat/chat_providers.dart';
import '../../../core/chat/domain/conversation.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/formatters.dart';
import '../../../shared/widgets/common.dart';
import 'chat_avatar.dart';
import 'chat_screen.dart';
import 'new_chat_dialog.dart';
import 'new_group_dialog.dart';

/// The Chats screen — private and group conversations, newest first.
class ChatListScreen extends ConsumerStatefulWidget {
  const ChatListScreen({super.key});

  @override
  ConsumerState<ChatListScreen> createState() => _ChatListScreenState();
}

class _ChatListScreenState extends ConsumerState<ChatListScreen> {
  final _searchController = TextEditingController();
  String _query = '';
  bool _unreadOnly = false;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final conversations = ref.watch(chatListProvider);
    final myId = ref.watch(currentUserProvider)?.id ?? 0;
    final unread = conversations.fold<int>(
      0,
      (sum, conversation) => sum + conversation.unreadCount,
    );

    final filtered = conversations.where((conversation) {
      if (_unreadOnly && conversation.unreadCount == 0) return false;
      final query = _query.trim().toLowerCase();
      if (query.isEmpty) return true;
      final name = conversation.displayName.toLowerCase();
      final preview = (conversation.lastMessage?.text ?? '').toLowerCase();
      return name.contains(query) || preview.contains(query);
    }).toList();

    return Scaffold(
      backgroundColor: AppColors.surface,
      body: Column(
        children: [
          _header(unread),
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 14, 18, 2),
            child: Row(
              children: [
                _FilterPill(
                  label: 'All',
                  selected: !_unreadOnly,
                  onTap: () => setState(() => _unreadOnly = false),
                ),
                const SizedBox(width: 8),
                _FilterPill(
                  label: unread > 0 ? 'Unread · $unread' : 'Unread',
                  selected: _unreadOnly,
                  onTap: () => setState(() => _unreadOnly = true),
                ),
              ],
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              color: AppColors.brand,
              onRefresh: () async {
                ref.invalidate(chatListProvider);
                await Future<void>.delayed(
                  const Duration(milliseconds: 450),
                );
              },
              child: filtered.isEmpty
                  ? ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      children: [
                        const SizedBox(height: 44),
                        EmptyState(
                          icon: _query.trim().isNotEmpty
                              ? Icons.search_off_rounded
                              : _unreadOnly
                              ? Icons.mark_email_read_outlined
                              : Icons.forum_outlined,
                          title: _query.trim().isNotEmpty
                              ? 'No matches'
                              : _unreadOnly
                              ? 'All caught up'
                              : 'No conversations yet',
                          message: _query.trim().isNotEmpty
                              ? 'Nothing matches “${_query.trim()}”. Try another name.'
                              : _unreadOnly
                              ? 'Nothing is unread right now. Switch back to All to see every conversation.'
                              : 'Start a private chat or a group and it appears here — on the web admin too.',
                          action: _query.trim().isNotEmpty || _unreadOnly
                              ? null
                              : FilledButton.icon(
                                  onPressed: _newChat,
                                  icon: const Icon(
                                    Icons.add_comment_outlined,
                                    size: 18,
                                  ),
                                  label: const Text('Start a chat'),
                                  style: FilledButton.styleFrom(
                                    minimumSize: const Size(170, 46),
                                  ),
                                ),
                        ),
                      ],
                    )
                  : ListView.builder(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 20),
                      itemCount: filtered.length,
                      itemBuilder: (context, index) {
                        final conversation = filtered[index];
                        return _ConversationCard(
                          conversation: conversation,
                          myId: myId,
                          onTap: () => _push(
                            ChatScreen(conversationId: conversation.id),
                          ),
                        );
                      },
                    ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _header(int unread) {
    final canPop = Navigator.of(context).canPop();
    return Container(
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [AppColors.brandDark, AppColors.brand],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: const BorderRadius.vertical(bottom: Radius.circular(28)),
        boxShadow: [
          BoxShadow(
            color: AppColors.brand.withValues(alpha: 0.28),
            blurRadius: 22,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      padding: EdgeInsets.fromLTRB(canPop ? 4 : 20, 2, 18, 18),
      child: SafeArea(
        bottom: false,
        child: Column(
          children: [
            Row(
              children: [
                if (canPop)
                  IconButton(
                    onPressed: () => Navigator.of(context).maybePop(),
                    icon: const Icon(Icons.arrow_back_rounded, color: Colors.white),
                    tooltip: 'Back',
                  ),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Chats',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 25,
                          fontWeight: FontWeight.w800,
                          letterSpacing: -0.5,
                        ),
                      ),
                      const SizedBox(height: 1),
                      Text(
                        unread > 0
                            ? '$unread unread ${unread == 1 ? 'message' : 'messages'}'
                            : 'Private & group conversations',
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.75),
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
                _HeaderAction(
                  icon: Icons.group_add_rounded,
                  tooltip: 'New group',
                  onTap: _newGroup,
                ),
                const SizedBox(width: 8),
                _HeaderAction(
                  icon: Icons.add_comment_rounded,
                  tooltip: 'New chat',
                  filled: true,
                  onTap: _newChat,
                ),
              ],
            ),
            const SizedBox(height: 14),
            Container(
              height: 44,
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(14),
              ),
              child: TextField(
                controller: _searchController,
                onChanged: (value) => setState(() => _query = value),
                style: const TextStyle(fontSize: 14),
                textInputAction: TextInputAction.search,
                decoration: InputDecoration(
                  hintText: 'Search conversations',
                  hintStyle: const TextStyle(
                    fontSize: 13.5,
                    color: AppColors.inkMuted,
                  ),
                  prefixIcon: const Icon(
                    Icons.search_rounded,
                    size: 20,
                    color: AppColors.inkMuted,
                  ),
                  suffixIcon: _query.isEmpty
                      ? null
                      : IconButton(
                          icon: const Icon(Icons.close_rounded, size: 18),
                          color: AppColors.inkMuted,
                          onPressed: () {
                            _searchController.clear();
                            setState(() => _query = '');
                          },
                        ),
                  filled: false,
                  border: InputBorder.none,
                  enabledBorder: InputBorder.none,
                  focusedBorder: InputBorder.none,
                  contentPadding: const EdgeInsets.symmetric(vertical: 12),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _newChat() async {
    final conversation = await showDialog<Conversation>(
      context: context,
      builder: (_) => const NewChatDialog(),
    );
    if (!mounted || conversation == null) return;
    await _push(ChatScreen(conversationId: conversation.id));
  }

  Future<void> _newGroup() async {
    final conversation = await showDialog<Conversation>(
      context: context,
      builder: (_) => const NewGroupDialog(),
    );
    if (!mounted || conversation == null) return;
    await _push(ChatScreen(conversationId: conversation.id));
  }

  Future<void> _push(Widget screen) {
    return Navigator.of(
      context,
    ).push(MaterialPageRoute<void>(builder: (_) => screen));
  }
}

class _ConversationCard extends StatelessWidget {
  const _ConversationCard({
    required this.conversation,
    required this.myId,
    required this.onTap,
  });

  final Conversation conversation;
  final int myId;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final last = conversation.lastMessage;
    final textPreview = (last?.text ?? '').trim();
    final hasImage = last?.image != null;
    final preview =
        textPreview.isEmpty && hasImage ? 'Photo' : textPreview;
    final fromMe = last?.userId == myId;
    final senderPrefix = !fromMe &&
            conversation.isGroup &&
            (last?.senderName ?? '').isNotEmpty
        ? '${last!.senderName}: '
        : '';
    final previewLabel = preview.isEmpty
        ? 'No messages yet'
        : '${fromMe ? 'You: ' : senderPrefix}$preview';
    final unread = conversation.unreadCount > 0;

    return Padding(
      padding: const EdgeInsets.only(bottom: 9),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(18),
          child: Ink(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(
                color: unread
                    ? AppColors.brand.withValues(alpha: 0.28)
                    : AppColors.line,
              ),
              boxShadow: [
                BoxShadow(
                  color: AppColors.ink.withValues(alpha: 0.045),
                  blurRadius: 14,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            padding: const EdgeInsets.all(13),
            child: Row(
              children: [
                ChatAvatar(
                  name: conversation.displayName,
                  size: 50,
                  isGroup: conversation.isGroup,
                ),
                const SizedBox(width: 13),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              conversation.displayName,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontSize: 15,
                                fontWeight: unread
                                    ? FontWeight.w800
                                    : FontWeight.w600,
                                letterSpacing: -0.1,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            _timeLabel(conversation.lastMessageAt),
                            style: TextStyle(
                              fontSize: 10.5,
                              fontWeight: unread
                                  ? FontWeight.w700
                                  : FontWeight.w500,
                              color: unread
                                  ? AppColors.brand
                                  : AppColors.inkMuted,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              previewLabel,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontSize: 12.5,
                                height: 1.35,
                                fontWeight: unread
                                    ? FontWeight.w600
                                    : FontWeight.w400,
                                color: unread
                                    ? AppColors.ink
                                    : AppColors.inkMuted,
                              ),
                            ),
                          ),
                          if (unread) ...[
                            const SizedBox(width: 8),
                            _UnreadBadge(count: conversation.unreadCount),
                          ],
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _HeaderAction extends StatelessWidget {
  const _HeaderAction({
    required this.icon,
    required this.tooltip,
    required this.onTap,
    this.filled = false,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;
  final bool filled;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: Material(
        color: filled ? Colors.white : Colors.white.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(14),
          child: Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              border: filled
                  ? null
                  : Border.all(color: Colors.white.withValues(alpha: 0.22)),
            ),
            child: Icon(
              icon,
              size: 20,
              color: filled ? AppColors.brand : Colors.white,
            ),
          ),
        ),
      ),
    );
  }
}

class _FilterPill extends StatelessWidget {
  const _FilterPill({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
        decoration: BoxDecoration(
          color: selected ? AppColors.brand : Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: selected ? AppColors.brand : AppColors.line,
          ),
          boxShadow: selected
              ? [
                  BoxShadow(
                    color: AppColors.brand.withValues(alpha: 0.22),
                    blurRadius: 8,
                    offset: const Offset(0, 3),
                  ),
                ]
              : const [],
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: selected ? Colors.white : AppColors.inkMuted,
          ),
        ),
      ),
    );
  }
}

class _UnreadBadge extends StatelessWidget {
  const _UnreadBadge({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    final label = count > 99 ? '99+' : '$count';
    return Container(
      alignment: Alignment.center,
      constraints: const BoxConstraints(minWidth: 20, minHeight: 20),
      padding: const EdgeInsets.symmetric(horizontal: 6),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [AppColors.brand, AppColors.brandDark],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(10),
        boxShadow: [
          BoxShadow(
            color: AppColors.brand.withValues(alpha: 0.3),
            blurRadius: 5,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Text(
        label,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 10.5,
          fontWeight: FontWeight.w800,
        ),
        textAlign: TextAlign.center,
      ),
    );
  }
}

String _timeLabel(String? iso) {
  final parsed = DateTime.tryParse(iso ?? '')?.toLocal();
  if (parsed == null) return '';
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final day = DateTime(parsed.year, parsed.month, parsed.day);
  if (day == today) return AppFormat.timeOfDay(parsed);
  if (day == today.subtract(const Duration(days: 1))) return 'Yesterday';
  return AppFormat.shortDate(parsed);
}
