import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/chat/chat_providers.dart';
import '../../../core/chat/data/chat_repository.dart';
import '../../../core/chat/data/chat_ws_client.dart';
import '../../../core/chat/domain/chat_message.dart';
import '../../../core/chat/domain/conversation.dart';
import '../../../core/config/app_config.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/formatters.dart';
import 'chat_avatar.dart';
import 'typing_dots.dart';

/// The chat thread — messages, live typing, and edit/delete on your own
/// messages.
class ChatScreen extends ConsumerStatefulWidget {
  const ChatScreen({super.key, required this.conversationId});

  final int conversationId;

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  final _controller = TextEditingController();
  final _scrollController = ScrollController();
  final Map<int, String> _typists = {};
  final Map<int, Timer> _typingTimers = {};

  XFile? _pendingImage;
  StreamSubscription<ChatWSEvent>? _typingSub;
  bool _sending = false;
  int _lastMessageCount = 0;
  DateTime? _lastTypingSent;

  @override
  void initState() {
    super.initState();
    _controller.addListener(_onDraftChanged);
    _typingSub = ref.read(chatWebSocketProvider).stream.listen(_onTypingEvent);
  }

  @override
  void dispose() {
    _typingSub?.cancel();
    for (final timer in _typingTimers.values) {
      timer.cancel();
    }
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  /// Send at most one typing signal every two seconds while the draft is
  /// non-empty. The server expires each signal after a few seconds, so the
  /// indicator disappears when the user stops.
  void _onDraftChanged() {
    if (_controller.text.trim().isEmpty) return;
    final now = DateTime.now();
    if (_lastTypingSent != null &&
        now.difference(_lastTypingSent!) < const Duration(seconds: 2)) {
      return;
    }
    _lastTypingSent = now;
    ref
        .read(chatRepositoryProvider)
        .setTyping(widget.conversationId)
        .catchError((_) {});
  }

  void _onTypingEvent(ChatWSEvent event) {
    if (event.conversationId != widget.conversationId) return;

    // A message from someone ends their typing state immediately — the
    // indicator must not sit beside the message it produced.
    if (event.type == ChatWSEventType.messageNew) {
      final senderId = event.message?.userId;
      if (senderId != null && _typists.remove(senderId) != null) {
        _typingTimers.remove(senderId)?.cancel();
        if (mounted) setState(() {});
      }
      return;
    }

    if (event.type != ChatWSEventType.typing) return;
    final userId = event.userId;
    if (userId == null) return;
    if (userId == (ref.read(currentUserProvider)?.id ?? 0)) return;

    final name = (event.userName ?? '').trim();
    _typingTimers[userId]?.cancel();
    _typingTimers[userId] = Timer(const Duration(seconds: 6), () {
      _typingTimers.remove(userId);
      if (!mounted) return;
      setState(() => _typists.remove(userId));
    });
    if (!mounted) return;
    setState(() => _typists[userId] = name.isEmpty ? 'Someone' : name);
  }

  @override
  Widget build(BuildContext context) {
    final repository = ref.watch(chatRepositoryProvider);
    final messages = ref.watch(chatMessagesProvider(widget.conversationId));
    final conversation = _findConversation(ref.watch(chatListProvider));
    final myId = ref.watch(currentUserProvider)?.id ?? 0;
    final typists = _typists.values.toList(growable: false);
    final items = messages.isEmpty && typists.isEmpty
        ? const <Widget>[]
        : _buildItems(
            context,
            repository,
            messages,
            conversation,
            myId,
            typists,
          );

    if (messages.length != _lastMessageCount) {
      _lastMessageCount = messages.length;
      WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToBottom());
    }

    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(
        titleSpacing: 0,
        title: Row(
          children: [
            ChatAvatar(
              name: conversation?.displayName,
              size: 38,
              isGroup: conversation?.isGroup == true,
            ),
            const SizedBox(width: 10),
            Flexible(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    conversation?.displayName ?? 'Chat',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 16.5,
                      letterSpacing: -0.2,
                    ),
                  ),
                  const SizedBox(height: 1),
                  _Subtitle(
                    conversation: conversation,
                    typists: typists,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
      body: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [Color(0xFFF4F7FB), Color(0xFFEAF1F9)],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
        ),
        child: Column(
          children: [
            Expanded(
              child: messages.isEmpty && typists.isEmpty
                  ? _ChatEmptyState(conversation: conversation)
                  : NotificationListener<ScrollNotification>(
                      onNotification: (notification) {
                        final metrics = notification.metrics;
                        if (metrics.pixels < 220 && metrics.atEdge) {
                          ref
                              .read(
                                chatMessagesProvider(
                                  widget.conversationId,
                                ).notifier,
                              )
                              .loadMore();
                        }
                        return false;
                      },
                      child: ListView.builder(
                        controller: _scrollController,
                        reverse: true,
                        padding: const EdgeInsets.fromLTRB(8, 14, 8, 10),
                        itemCount: items.length,
                        itemBuilder: (context, index) =>
                            items[items.length - 1 - index],
                      ),
                    ),
            ),
            _composer,
          ],
        ),
      ),
    );
  }

  List<Widget> _buildItems(
    BuildContext context,
    ChatRepository repository,
    List<ChatMessage> messages,
    Conversation? conversation,
    int myId,
    List<String> typists,
  ) {
    final items = <Widget>[];
    DateTime? lastDate;
    int? lastSender;
    DateTime? lastTime;

    for (final message in messages) {
      final created = DateTime.tryParse(message.createdAt ?? '')?.toLocal();
      if (created != null &&
          (lastDate == null || !_sameDay(lastDate, created))) {
        items.add(_DateSeparator(label: _dateLabel(created)));
        lastDate = created;
        lastSender = null;
        lastTime = null;
      }

      final isMine = message.userId == myId;
      final sameGroup =
          lastSender == message.userId &&
          lastTime != null &&
          created != null &&
          created.difference(lastTime).inMinutes < 5;

      items.add(
        _MessageRow(
          message: message,
          isMine: isMine,
          isGroup: conversation?.isGroup == true,
          memberCount: conversation?.members.length ?? 2,
          myId: myId,
          showName:
              conversation?.isGroup == true && !isMine && !sameGroup,
          showAvatar: !isMine && !sameGroup,
          onLongPress: () => _openReactionSheet(context, repository, message),
        ),
      );

      lastSender = message.userId;
      lastTime = created ?? lastTime;
    }

    if (typists.isNotEmpty) items.add(_TypingBubble(names: typists));
    return items;
  }

  Widget get _composer {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: AppColors.line)),
      ),
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 8),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (_pendingImage != null)
              _PendingImagePreview(
                file: _pendingImage!,
                onRemove: () => setState(() => _pendingImage = null),
              ),
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                IconButton(
                  alignment: Alignment.center,
                  iconSize: 21,
                  splashRadius: 18,
                  icon: const Icon(
                    Icons.image_rounded,
                    size: 21,
                    color: AppColors.brand,
                  ),
                  onPressed: _pickImage,
                  tooltip: 'Attach a photo',
                ),
                const SizedBox(width: 2),
                Expanded(
                  child: Container(
                    decoration: BoxDecoration(
                      color: AppColors.surface,
                      borderRadius: BorderRadius.circular(24),
                      border: Border.all(color: AppColors.line),
                    ),
                    child: TextField(
                      controller: _controller,
                      minLines: 1,
                      maxLines: 5,
                      textCapitalization: TextCapitalization.sentences,
                      textInputAction: TextInputAction.send,
                      onSubmitted: (_) => _send(),
                      style: const TextStyle(fontSize: 15, height: 1.35),
                      decoration: const InputDecoration(
                        hintText: 'Message…',
                        filled: false,
                        border: InputBorder.none,
                        enabledBorder: InputBorder.none,
                        focusedBorder: InputBorder.none,
                        contentPadding: EdgeInsets.symmetric(
                          horizontal: 18,
                          vertical: 12,
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                ValueListenableBuilder<TextEditingValue>(
                  valueListenable: _controller,
                  builder: (context, value, _) {
                    final canSend =
                        (value.text.trim().isNotEmpty || _pendingImage != null) &&
                        !_sending;
                    return GestureDetector(
                      onTap: canSend ? _send : null,
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 180),
                        curve: Curves.easeOut,
                        width: 48,
                        height: 48,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          gradient: canSend
                              ? const LinearGradient(
                                  colors: [AppColors.brand, AppColors.brandDark],
                                  begin: Alignment.topLeft,
                                  end: Alignment.bottomRight,
                                )
                              : null,
                          color: canSend ? null : AppColors.line,
                          shape: BoxShape.circle,
                          boxShadow: canSend
                              ? [
                                  BoxShadow(
                                    color: AppColors.brand.withValues(alpha: 0.32),
                                    blurRadius: 12,
                                    offset: const Offset(0, 4),
                                  ),
                                ]
                              : const [],
                        ),
                        child: _sending
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : Icon(
                                Icons.arrow_upward_rounded,
                                size: 21,
                                color: canSend ? Colors.white : AppColors.inkMuted,
                              ),
                      ),
                    );
                  },
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  void _scrollToBottom() {
    if (!_scrollController.hasClients) return;
    _scrollController.jumpTo(0);
  }

  Conversation? _findConversation(List<Conversation> conversations) {
    for (final conversation in conversations) {
      if (conversation.id == widget.conversationId) return conversation;
    }
    return null;
  }

  Future<void> _pickImage() async {
    final picker = ImagePicker();
    final file = await picker.pickImage(
      source: ImageSource.gallery,
      imageQuality: 85,
      maxWidth: 2400,
    );
    if (!mounted || file == null) return;
    setState(() => _pendingImage = file);
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if ((text.isEmpty && _pendingImage == null) || _sending) return;
    setState(() => _sending = true);
    final repository = ref.read(chatRepositoryProvider);
    final notifier = ref.read(
      chatMessagesProvider(widget.conversationId).notifier,
    );
    try {
      int? imageMediaId;
      if (_pendingImage != null) {
        final media = await repository.uploadImage(_pendingImage!.path);
        imageMediaId = media.id;
      }
      final message = await repository.sendMessage(
        widget.conversationId,
        text: text,
        imageMediaId: imageMediaId,
      );
      if (mounted) notifier.insertSent(message);
      if (mounted) ref.invalidate(chatListProvider);
      setState(() {
        _pendingImage = null;
        _controller.clear();
      });
    } catch (error) {
      // Put the draft back so a failed send does not lose what was typed —
      // unless the user has already started a new message.
      if (_controller.text.isEmpty) _controller.text = text;
      _showError(error);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _addReaction(
    ChatRepository repository,
    ChatMessage message,
    String emoji,
  ) async {
    try {
      await repository.addReaction(widget.conversationId, message.id, emoji);
      if (mounted) ref.invalidate(chatMessagesProvider(widget.conversationId));
    } catch (error) {
      _showError(error, action: 'add a reaction');
    }
  }

  Future<void> _removeReaction(
    ChatRepository repository,
    ChatMessage message,
    String emoji,
  ) async {
    try {
      await repository.removeReaction(widget.conversationId, message.id, emoji);
      if (mounted) ref.invalidate(chatMessagesProvider(widget.conversationId));
    } catch (error) {
      _showError(error, action: 'remove a reaction');
    }
  }

  void _openReactionSheet(
    BuildContext context,
    ChatRepository repository,
    ChatMessage message,
  ) {
    final myId = ref.watch(currentUserProvider)?.id ?? 0;
    final isMine = message.userId == myId;
    final palette = [
      '👍',
      '❤️',
      '😂',
      '😀',
      '🤣',
      '🤩',
      '😍',
      '🥰',
      '🙌',
      '🎉',
      '🤯',
      '🙃',
    ];

    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (dialogContext) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 14, 18, 6),
                child: Text(
                  'React',
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                ),
              ),
              if (message.reactions.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 18, 8),
                  child: Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final reaction in message.reactions)
                        _ReactionChip(emoji: reaction.emoji),
                    ],
                  ),
                ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 6, 18, 12),
                child: Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  alignment: WrapAlignment.center,
                  children: [
                    for (final emoji in palette)
                      _ReactionChip(
                        emoji: emoji,
                        onTap: () {
                          if (message.hasReaction(myId, emoji: emoji)) {
                            _removeReaction(repository, message, emoji);
                          } else {
                            _addReaction(repository, message, emoji);
                          }
                          Navigator.of(dialogContext).pop();
                        },
                      ),
                  ],
                ),
              ),
              if (isMine) ...[
                ListTile(
                  leading: const Icon(Icons.edit_outlined),
                  title: const Text('Edit message'),
                  onTap: () {
                    Navigator.of(dialogContext).pop();
                    _editMessage(context, repository, message);
                  },
                ),
                ListTile(
                  leading: Icon(Icons.delete_outline, color: AppColors.danger),
                  title: Text(
                    'Delete message',
                    style: TextStyle(color: AppColors.danger),
                  ),
                  onTap: () {
                    Navigator.of(dialogContext).pop();
                    _deleteMessage(repository, message);
                  },
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _editMessage(
    BuildContext context,
    ChatRepository repository,
    ChatMessage message,
  ) async {
    final notifier = ref.read(
      chatMessagesProvider(widget.conversationId).notifier,
    );
    final textController = TextEditingController(text: message.text ?? '');
    final updated = await showDialog<String?>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Edit message'),
        content: TextField(
          controller: textController,
          autofocus: true,
          minLines: 2,
          maxLines: 5,
          decoration: const InputDecoration(hintText: 'Message…'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () =>
                Navigator.of(dialogContext).pop(textController.text.trim()),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    textController.dispose();
    if (updated == null || updated.isEmpty) return;
    try {
      final edited = await repository.editMessage(
        widget.conversationId,
        message.id,
        text: updated,
      );
      if (mounted) notifier.insertSent(edited);
    } catch (error) {
      _showError(error, action: 'edit the message');
    }
  }

  Future<void> _deleteMessage(
    ChatRepository repository,
    ChatMessage message,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Delete message'),
        content: const Text(
          'Your message disappears from the thread. You can delete your own messages any time.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await repository.deleteMessage(widget.conversationId, message.id);
      if (mounted) {
        ref
            .read(chatMessagesProvider(widget.conversationId).notifier)
            .removeMessage(message.id);
      }
    } catch (error) {
      _showError(error, action: 'delete the message');
    }
  }

  void _showError(Object error, {String action = 'send'}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Could not $action: $error')),
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Small pieces                                                                */
/* -------------------------------------------------------------------------- */

bool _sameDay(DateTime a, DateTime b) =>
    a.year == b.year && a.month == b.month && a.day == b.day;

String _dateLabel(DateTime date) {
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final day = DateTime(date.year, date.month, date.day);
  if (day == today) return 'Today';
  if (day == today.subtract(const Duration(days: 1))) return 'Yesterday';
  return AppFormat.date(date);
}

class _Subtitle extends StatelessWidget {
  const _Subtitle({required this.conversation, required this.typists});

  final Conversation? conversation;
  final List<String> typists;

  @override
  Widget build(BuildContext context) {
    if (typists.isNotEmpty) {
      final label = typists.length == 1
          ? '${typists.first} is typing…'
          : '${typists.length} people are typing…';
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            style: const TextStyle(
              fontSize: 11.5,
              fontWeight: FontWeight.w600,
              color: AppColors.brand,
            ),
          ),
          const SizedBox(width: 6),
          const TypingDots(size: 3.5, gap: 2),
        ],
      );
    }

    final label = conversation?.isGroup == true
        ? '${conversation?.members.length ?? 0} members'
        : 'Private conversation';
    return Text(
      label,
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: const TextStyle(fontSize: 11.5, color: AppColors.inkMuted),
    );
  }
}

class _DateSeparator extends StatelessWidget {
  const _DateSeparator({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Center(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.85),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: AppColors.line),
          ),
          child: Text(
            label,
            style: const TextStyle(
              fontSize: 10.5,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.4,
              color: AppColors.inkMuted,
            ),
          ),
        ),
      ),
    );
  }
}

class _MessageRow extends StatelessWidget {
  const _MessageRow({
    required this.message,
    required this.isMine,
    required this.isGroup,
    required this.memberCount,
    required this.myId,
    required this.showName,
    required this.showAvatar,
    this.onLongPress,
  });

  final ChatMessage message;
  final bool isMine;
  final bool isGroup;
  final int memberCount;
  final int myId;
  final bool showName;
  final bool showAvatar;
  final VoidCallback? onLongPress;

  /// Who else has consumed this message, from the server-provided read receipt.
  List<ChatReader> get readers =>
      message.readBy.where((reader) => reader.userId != myId).toList();

  /// What the sender sees: ticks plus a short label so users can tell
  /// "sent" from "seen" without relying on colour alone.
  String get seenLabel {
    final readerCount = readers.length;
    if (readerCount == 0) return 'Sent';
    if (!isGroup || readerCount >= memberCount - 1) return 'Seen';
    return 'Seen by $readerCount';
  }

  @override
  Widget build(BuildContext context) {
    final maxWidth = MediaQuery.of(context).size.width * 0.76;
    final text = message.text ?? '';

    return Padding(
      padding: EdgeInsets.only(
        top: showName ? 9 : 2,
        bottom: 2,
        left: 6,
        right: 6,
      ),
      child: Row(
        mainAxisAlignment: isMine
            ? MainAxisAlignment.end
            : MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          if (!isMine) ...[
            SizedBox(
              width: 30,
              child: showAvatar
                  ? ChatAvatar(name: message.senderName, size: 30)
                  : null,
            ),
            const SizedBox(width: 7),
          ],
          Flexible(
            child: Column(
              crossAxisAlignment: isMine
                  ? CrossAxisAlignment.end
                  : CrossAxisAlignment.start,
              children: [
                if (showName)
                  Padding(
                    padding: const EdgeInsets.only(left: 4, bottom: 3),
                    child: Text(
                      message.senderName ?? 'Member',
                      style: const TextStyle(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w700,
                        color: AppColors.brand,
                      ),
                    ),
                  ),
                GestureDetector(
                  onLongPress: onLongPress,
                  child: Container(
                    constraints: BoxConstraints(maxWidth: maxWidth),
                    padding: const EdgeInsets.fromLTRB(14, 9, 14, 7),
                    decoration: BoxDecoration(
                      gradient: isMine
                          ? const LinearGradient(
                              colors: [AppColors.brand, AppColors.brandDark],
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                            )
                          : null,
                      color: isMine ? null : Colors.white,
                      borderRadius: BorderRadius.only(
                        topLeft: const Radius.circular(18),
                        topRight: const Radius.circular(18),
                        bottomLeft: Radius.circular(
                          isMine ? 18 : (showAvatar ? 6 : 18),
                        ),
                        bottomRight: Radius.circular(isMine ? 6 : 18),
                      ),
                      border: isMine
                          ? null
                          : Border.all(
                              color: AppColors.line.withValues(alpha: 0.9),
                            ),
                      boxShadow: [
                        BoxShadow(
                          color: AppColors.ink.withValues(
                            alpha: isMine ? 0.16 : 0.05,
                          ),
                          blurRadius: 10,
                          offset: const Offset(0, 3),
                        ),
                      ],
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (message.hasImage)
                          _MessageImage(
                            image: message.image!,
                            maxWidth: maxWidth,
                          ),
                        if (text.trim().isNotEmpty)
                          Padding(
                            padding: EdgeInsets.only(
                              top: message.hasImage ? 4 : 0,
                            ),
                            child: Text(
                              text,
                              style: TextStyle(
                                color: isMine ? Colors.white : AppColors.ink,
                                fontSize: 15,
                                height: 1.4,
                              ),
                            ),
                          ),
                        const SizedBox(height: 3),
                        if (message.reactions.isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.only(top: 1),
                            child: Wrap(
                              spacing: 3,
                              runSpacing: 2,
                              alignment: WrapAlignment.start,
                              children: [
                                for (final reaction in message.reactions)
                                  _ReactionChip(
                                    emoji: reaction.emoji,
                                    onTap: onLongPress,
                                  ),
                              ],
                            ),
                          ),
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              AppFormat.timeOfDay(message.createdAt),
                              style: TextStyle(
                                color: isMine
                                    ? Colors.white.withValues(alpha: 0.7)
                                    : AppColors.inkMuted,
                                fontSize: 10,
                                letterSpacing: 0.2,
                              ),
                            ),
                            if (message.hasEdited) ...[
                              const SizedBox(width: 4),
                              Text(
                                '· edited',
                                style: TextStyle(
                                  color: isMine
                                      ? Colors.white.withValues(alpha: 0.7)
                                      : AppColors.inkMuted,
                                  fontSize: 10,
                                  fontStyle: FontStyle.italic,
                                ),
                              ),
                            ],
                            if (isMine) ...[
                              const SizedBox(width: 5),
                              Icon(
                                readers.isEmpty
                                    ? Icons.done_rounded
                                    : Icons.done_all_rounded,
                                size: 13,
                                color: Colors.white.withValues(alpha: 0.75),
                              ),
                              const SizedBox(width: 4),
                              Text(
                                seenLabel,
                                style: TextStyle(
                                  color: Colors.white.withValues(alpha: 0.75),
                                  fontSize: 10,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ReactionChip extends StatelessWidget {
  const _ReactionChip({required this.emoji, this.onTap});

  final String emoji;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
        decoration: BoxDecoration(
          color: AppColors.line.withValues(alpha: 0.55),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Text(emoji, style: const TextStyle(fontSize: 10.5)),
      ),
    );
  }
}

class _MessageImage extends StatelessWidget {
  const _MessageImage({required this.image, required this.maxWidth});

  final ChatImage image;
  final double maxWidth;

  @override
  Widget build(BuildContext context) {
    final url = AppConfig.resolveMediaUrl(image.url);
    return ConstrainedBox(
      constraints: BoxConstraints(maxWidth: maxWidth, maxHeight: 260),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(14),
        child: url.isEmpty
            ? const Center(
                child: Icon(Icons.broken_image_outlined, size: 28),
              )
            : Image.network(
                url,
                width: double.infinity,
                height: double.infinity,
                fit: BoxFit.cover,
                loadingBuilder:
                    (context, child, loading) =>
                        const Center(
                            child: SizedBox(
                              width: 22,
                              height: 22,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )),
                errorBuilder:
                    (context, error, stackTrace) => const Center(
                      child: Icon(
                        Icons.broken_image_outlined,
                        size: 28,
                        color: AppColors.inkMuted,
                      ),
                    ),
              ),
      ),
    );
  }
}

class _PendingImagePreview extends StatelessWidget {
  const _PendingImagePreview({required this.file, required this.onRemove});

  final XFile file;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 8, right: 8, bottom: 8),
      child: Row(
        children: [
          GestureDetector(
            onTap: onRemove,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(9),
              child: Image.file(
                File(file.path),
                width: 56,
                height: 56,
                fit: BoxFit.cover,
              ),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'Photo',
              style: TextStyle(
                color: AppColors.inkMuted,
                fontSize: 12,
              ),
            ),
          ),
          const SizedBox(width: 6),
          IconButton(
            tooltip: 'Cancel photo',
            icon: const Icon(Icons.close_rounded, size: 18, color: AppColors.inkMuted),
            onPressed: onRemove,
            constraints: const BoxConstraints.tightFor(width: 24, height: 24),
          ),
        ],
      ),
    );
  }
}

class _TypingBubble extends StatelessWidget {
  const _TypingBubble({required this.names});

  final List<String> names;

  @override
  Widget build(BuildContext context) {
    final label = names.length == 1
        ? '${names.first} is typing'
        : '${names.length} people are typing';
    return Padding(
      padding: const EdgeInsets.only(top: 6, bottom: 2, left: 6, right: 6),
      child: Row(
        children: [
          ChatAvatar(name: names.first, size: 30),
          const SizedBox(width: 7),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(18),
                topRight: Radius.circular(18),
                bottomLeft: Radius.circular(6),
                bottomRight: Radius.circular(18),
              ),
              border: Border.all(color: AppColors.line),
              boxShadow: [
                BoxShadow(
                  color: AppColors.ink.withValues(alpha: 0.05),
                  blurRadius: 10,
                  offset: const Offset(0, 3),
                ),
              ],
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const TypingDots(size: 5.5, gap: 3),
                const SizedBox(width: 9),
                Text(
                  label,
                  style: const TextStyle(
                    fontSize: 11.5,
                    color: AppColors.inkMuted,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ChatEmptyState extends StatelessWidget {
  const _ChatEmptyState({required this.conversation});

  final Conversation? conversation;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [AppColors.brand, AppColors.brandDark],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: AppColors.brand.withValues(alpha: 0.3),
                    blurRadius: 22,
                    offset: const Offset(0, 8),
                  ),
                ],
              ),
              child: const Icon(
                Icons.forum_rounded,
                color: Colors.white,
                size: 32,
              ),
            ),
            const SizedBox(height: 16),
            Text(
              'Start the conversation',
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                letterSpacing: -0.2,
              ),
            ),
            const SizedBox(height: 5),
            Text(
              conversation?.isGroup == true
                  ? 'Say hello to ${conversation?.displayName ?? 'the group'}.'
                  : 'Say hello to ${conversation?.displayName ?? 'your teammate'}.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 12.5,
                height: 1.45,
                color: AppColors.inkMuted,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
