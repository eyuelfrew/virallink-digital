import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'dart:async';

import '../../features/auth/domain/app_user.dart';
import '../config/app_config.dart';
import '../providers.dart';
import 'data/chat_repository.dart';
import 'data/chat_ws_client.dart';
import 'domain/chat_message.dart';
import 'domain/conversation.dart';

final chatRepositoryProvider = Provider<ChatRepository>((ref) {
  return ChatRepository(ref.watch(apiClientProvider));
});

/// Bumped whenever any chat WebSocket event arrives — screens refresh.
final chatRefreshCounterProvider = NotifierProvider<ChatRefreshCounterNotifier, int>(
  ChatRefreshCounterNotifier.new,
);

class ChatRefreshCounterNotifier extends Notifier<int> {
  @override
  int build() => 0;

  void bump() => state++;
}

/// The realtime socket for the app. One per app, connected while mounted;
/// reconnects with a growing backoff. Stays connected only while a token is
/// available (no token, no socket — and none when the session is signed out).
final chatWebSocketProvider = Provider((ref) {
  final ws = ChatWebSocketClient(
    url: () => Uri.parse(AppConfig.wsEndpoint),
    token: () => ref.read(tokenStoreProvider).accessToken,
  );
  ws.connect();
  // Typing is presence, not data: it must not refetch the conversation list
  // on every keystroke from every member.
  ws.onEvent = (event) {
    if (event.type != ChatWSEventType.typing) {
      ref.read(chatRefreshCounterProvider.notifier).bump();
    }
  };
  ref.onDispose(ws.disconnect);
  return ws;
});

/// Conversations for the chat list. Refreshes when any WS event arrives.
final chatListProvider = NotifierProvider<ChatListNotifier, List<Conversation>>(
  ChatListNotifier.new,
);

class ChatListNotifier extends Notifier<List<Conversation>> {
  @override
  List<Conversation> build() {
    ref.listen(chatRefreshCounterProvider, (previous, next) => _load());
    _load();
    return const [];
  }

  Future<void> _load() async {
    try {
      state = await ref.watch(chatRepositoryProvider).listConversations();
    } catch (_) {
      // Stay on the previous list — the next event or poll refreshes it.
    }
  }
}

/// Messages of one conversation, oldest first. Merges live socket events with
/// REST history and polls when the socket is down.
final chatMessagesProvider =
    NotifierProvider.family<ChatMessagesNotifier, List<ChatMessage>, int>(
      (conversationId) => ChatMessagesNotifier(conversationId),
    );

/// Matches the API default page size so `loadMore` can ask for one more page
/// than it already has and detect the end.
const int kChatMessagePageSize = 50;

class ChatMessagesNotifier extends Notifier<List<ChatMessage>> {
  ChatMessagesNotifier(this.conversationId);
  final int conversationId;

  StreamSubscription<ChatWSEvent>? _socketSub;
  Timer? _pollTimer;
  bool _hasMore = true;
  bool _loadingMore = false;

  @override
  List<ChatMessage> build() {
    final ws = ref.watch(chatWebSocketProvider);
    _socketSub = ws.stream.listen((event) => _onSocketEvent(event));
    _pollTimer = Timer.periodic(const Duration(seconds: 2), (_) {
      // Poll fallback when the socket is down (e.g. a proxy killing
      // WebSockets) so nothing is silently lost while the screen is open.
      if (!ref.read(chatWebSocketProvider).isConnected) _load();
    });
    _load();
    ref.onDispose(() {
      _socketSub?.cancel();
      _pollTimer?.cancel();
    });
    return const [];
  }

  /// Load older history before the current oldest message.
  Future<void> loadMore() async {
    if (_loadingMore || !_hasMore || state.isEmpty) return;
    final oldestId = state.first.id;
    _loadingMore = true;
    try {
      final older = await ref
          .read(chatRepositoryProvider)
          .loadMessages(conversationId, cursor: oldestId, limit: kChatMessagePageSize);
      final known = state.map((message) => message.id).toSet();
      final prepend = [
        for (final message in older)
          if (!known.contains(message.id)) message,
      ];
      if (prepend.isEmpty) {
        _hasMore = false;
      } else {
        state = [...prepend, ...state]..sort((a, b) => a.id.compareTo(b.id));
        _hasMore = older.length == kChatMessagePageSize;
      }
    } catch (_) {
      // Keep the current view; a later poll or scroll retry refreshes it.
    } finally {
      _loadingMore = false;
    }
  }

  void _onSocketEvent(ChatWSEvent event) {
    if (event.conversationId != conversationId) return;
    switch (event.type) {
      case ChatWSEventType.messageNew:
      case ChatWSEventType.messageUpdated:
        final message = event.message;
        if (message != null) _addOrReplace(message);
      case ChatWSEventType.messageDeleted:
        final messageId = event.messageId;
        if (messageId != null) {
          state = [for (final m in state) if (m.id != messageId) m];
        }
      case ChatWSEventType.messageReactions:
        final messageId = event.messageId;
        if (messageId != null) {
          final updated = [
            for (final message in state)
              if (message.id == messageId)
                message.copyWith(reactions: event.reactions)
              else
                message,
          ];
          state = updated;
        }
      case ChatWSEventType.conversationRead:
        // Another (or this) client advanced a read cursor. Reload so seen
        // receipts appear, but do not mark-read again — that would loop.
        unawaited(_load(markRead: false));
      case ChatWSEventType.typing:
      case ChatWSEventType.conversationCreated:
      case null:
        break;
    }
  }

  void _addOrReplace(ChatMessage message) {
    final existing = state.where((m) => m.id == message.id).toList();
    if (existing.isNotEmpty) {
      state = [for (final m in state) m.id == message.id ? message : m];
    } else {
      state = [...state, message]..sort((a, b) => a.id.compareTo(b.id));
    }
  }

  /// Add a message sent through the API (immediate feedback before the WS echo).
  void insertSent(ChatMessage message) => _addOrReplace(message);

  /// Drop one message (the server deleted it; the socket echoes it too).
  void removeMessage(int messageId) =>
      state = [for (final m in state) if (m.id != messageId) m];

  Future<void> _load({bool markRead = true}) async {
    try {
      final messages = await ref
          .watch(chatRepositoryProvider)
          .loadMessages(conversationId);
      // Merge with locally known messages so a missed echo or slow socket
      // never loses a row the REST call just confirmed.
      state = [
        ...messages,
        for (final m in state)
          if (!messages.any((known) => known.id == m.id)) m,
      ]..sort((a, b) => a.id.compareTo(b.id));
      _hasMore = messages.length == kChatMessagePageSize;
      final latest = state.isNotEmpty ? state.last.id : null;
      if (markRead) {
        // Opening a chat means everything so far is read.
        await ref
            .watch(chatRepositoryProvider)
            .markRead(conversationId, messageId: latest);
      }
    } catch (_) {
      // Keep the current view; the socket or a retry will refresh it.
    }
  }
}

/// Accounts that may be picked as chat partners (the New chat / New group
/// pickers). The signed-in user is removed — chatting with yourself is not a
/// conversation the API accepts.
final newChatUsersProvider = FutureProvider.autoDispose<List<AppUser>>((
  ref,
) async {
  final myId = ref.watch(currentUserProvider)?.id;
  final users = await ref.watch(chatRepositoryProvider).listUsers();
  return [
    for (final user in users)
      if (myId == null || user.id != myId) user,
  ];
});
