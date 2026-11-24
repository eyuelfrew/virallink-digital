import '../../../core/network/api_client.dart';
import '../../utils/json.dart';
import '../domain/chat_message.dart';
import '../domain/conversation.dart';
import '../../../features/auth/domain/app_user.dart';

/// REST calls for the user-chat API. All endpoints require the standard
/// bearer session — the same one the app's ApiClient attaches.
class ChatRepository {
  ChatRepository(this._api);
  final ApiClient _api;

  Future<List<Conversation>> listConversations() async {
    final response = await _api.get('/chat/conversations');
    final rows = response.asMap['conversations'];
    if (rows is! List) return const [];
    return [
      for (final entry in rows.whereType<Map>())
        Conversation.fromJson(Map<String, dynamic>.from(entry)),
    ];
  }

  /// Create a private 1:1 chat. Returns the existing one if it already exists,
  /// so double-tapping never forks a thread.
  Future<Conversation> createPrivateChat({required int userId}) async {
    final response = await _api.post(
      '/chat/conversations',
      body: {'isGroup': false, 'memberIds': [userId]},
    );
    return Conversation.fromJson(
      Map<String, dynamic>.from(response.asMap['conversation']),
    );
  }

  Future<Conversation> createGroupChat({
    required String title,
    required List<int> memberIds,
  }) async {
    final response = await _api.post(
      '/chat/conversations',
      body: {'isGroup': true, 'title': title, 'memberIds': memberIds},
    );
    return Conversation.fromJson(
      Map<String, dynamic>.from(response.asMap['conversation']),
    );
  }

  /// History of one conversation, oldest first. [cursor] is a message id —
  /// anything older than it comes back (for "load more" pagination).
  Future<List<ChatMessage>> loadMessages(
    int conversationId, {
    int? cursor,
    int limit = 50,
  }) async {
    final query = <String, dynamic>{'limit': limit};
    if (cursor != null) query['cursor'] = cursor;
    final response = await _api.get(
      '/chat/conversations/$conversationId/messages',
      query: query,
    );
    final rows = response.asMap['messages'];
    if (rows is! List) return const [];
    return [
      for (final entry in rows.whereType<Map>())
        ChatMessage.fromJson(Map<String, dynamic>.from(entry)),
    ];
  }

  /// Attach an image from the gallery. Returns the uploaded media metadata
  /// the API recorded; send it with [sendMessage] using [imageMediaId].
  Future<ChatImage> uploadImage(String filePath) async {
    final response = await _api.upload(
      '/chat/uploads',
      filePath: filePath,
      field: 'file',
    );
    final media = response.asMap['media'];
    if (media is! Map) {
      throw Exception('The chat upload did not return an image.');
    }
    return ChatImage.fromJson(Map<String, dynamic>.from(media));
  }

  Future<ChatMessage> sendMessage(
    int conversationId, {
    required String text,
    int? replyToId,
    int? imageMediaId,
  }) async {
    final body = <String, dynamic>{};
    if (text.isNotEmpty) body['text'] = text;
    if (imageMediaId != null) body['imageMediaId'] = imageMediaId;
    if (replyToId != null) body['replyToId'] = replyToId;
    final response = await _api.post(
      '/chat/conversations/$conversationId/messages',
      body: body,
    );
    return ChatMessage.fromJson(
      Map<String, dynamic>.from(response.asMap['message']),
    );
  }

  Future<ChatMessage> editMessage(
    int conversationId,
    int messageId, {
    required String text,
  }) async {
    final response = await _api.post(
      '/chat/conversations/$conversationId/messages/$messageId',
      body: {'text': text},
    );
    return ChatMessage.fromJson(
      Map<String, dynamic>.from(response.asMap['message']),
    );
  }

  Future<void> deleteMessage(int conversationId, int messageId) async {
    await _api.delete('/chat/conversations/$conversationId/messages/$messageId');
  }

  /// Advance the read cursor. [messageId] of null means "everything so far".
  Future<void> markRead(int conversationId, {int? messageId}) async {
    final body = <String, dynamic>{};
    if (messageId != null) body['messageId'] = messageId;
    await _api.post('/chat/conversations/$conversationId/read', body: body);
  }

  /// Tell the server the composer is being used. Throttled by the caller —
  /// the server expires the signal on its own after a few seconds.
  Future<void> setTyping(int conversationId) async {
    await _api.post('/chat/conversations/$conversationId/typing', body: const {});
  }

  List<ChatReaction> _parseReactions(dynamic value) =>
      mapsOr(value).map(ChatReaction.fromJson).toList();

  Future<List<ChatReaction>> addReaction(
    int conversationId,
    int messageId,
    String emoji,
  ) async {
    final response = await _api.post(
      '/chat/conversations/$conversationId/messages/$messageId/reactions',
      body: {'emoji': emoji},
    );
    return _parseReactions(response.asMap['reactions']);
  }

  Future<List<ChatReaction>> removeReaction(
    int conversationId,
    int messageId,
    String emoji,
  ) async {
    final response = await _api.delete(
      '/chat/conversations/$conversationId/messages/$messageId/reactions',
      body: {'emoji': emoji},
    );
    return _parseReactions(response.asMap['reactions']);
  }

  Future<List<ChatMessage>> searchMessages(
    int conversationId,
    String query, {
    int cursor = 0,
  }) async {
    final response = await _api.get(
      '/chat/conversations/$conversationId/search',
      query: {'q': query, if (cursor > 0) 'cursor': cursor},
    );
    final rows = response.asMap['messages'];
    if (rows is! List) return const [];
    return [
      for (final entry in rows.whereType<Map>())
        ChatMessage.fromJson(Map<String, dynamic>.from(entry)),
    ];
  }

  Future<Map<String, dynamic>?> getLinkPreview(String url) async {
    final response = await _api.get('/chat/link-preview', query: {'url': url});
    final preview = response.asMap['preview'];
    if (preview is! Map) return null;
    return Map<String, dynamic>.from(preview);
  }

  Future<Conversation> pinConversation(int conversationId, {bool pinned = true}) async {
    final response = await _api.patch(
      '/chat/conversations/$conversationId/pin',
      body: {'pinned': pinned},
    );
    return Conversation.fromJson(Map<String, dynamic>.from(response.asMap['conversation']));
  }

  Future<bool> muteConversation(int conversationId, {bool muted = true}) async {
    final response = await _api.patch(
      '/chat/conversations/$conversationId/mute',
      body: {'muted': muted},
    );
    return response.asMap['muted'] == true;
  }

  /// Accounts that may be picked as chat partners. This is the chat-scoped
  /// directory (`/chat/users`) rather than the admin user list, so it works
  /// for every signed-in account, not only those with `user.read`.
  Future<List<AppUser>> listUsers() async {
    final response = await _api.get('/chat/users');
    final rows = response.asMap['users'];
    if (rows is! List) return const [];
    return [
      for (final entry in rows.whereType<Map>())
        AppUser.fromJson(Map<String, dynamic>.from(entry)),
    ];
  }
}
