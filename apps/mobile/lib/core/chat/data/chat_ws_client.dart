import 'dart:async';
import 'dart:convert';
import 'package:web_socket_channel/io.dart';

import '../../../core/utils/json.dart';
import '../domain/chat_message.dart';
import '../domain/conversation.dart';

enum ChatWSEventType {
  messageNew('message.new'),
  messageUpdated('message.updated'),
  messageDeleted('message.deleted'),
  messageReactions('message.reactions'),
  conversationRead('conversation.read'),
  typing('typing'),
  conversationCreated('conversation.created');

  const ChatWSEventType(this.wire);
  final String wire;

  static ChatWSEventType? fromWire(String? value) =>
      ChatWSEventType.values.where((t) => t.wire == value).firstOrNull;
}

class ChatWSEvent {
  const ChatWSEvent({
    required this.type,
    this.conversationId,
    this.message,
    this.messageId,
    this.conversation,
    this.userId,
    this.userName,
    this.lastReadMessageId,
    this.reactions = const [],
  });

  final ChatWSEventType? type;
  final int? conversationId;
  final ChatMessage? message;
  final int? messageId;
  final Conversation? conversation;

  /// Set on `typing` events: who is typing.
  final int? userId;
  final String? userName;

  /// Set on `conversation.read` events: the member's new read cursor.
  final int? lastReadMessageId;

  /// Set on `message.reactions` events: the message's reaction list.
  final List<ChatReaction> reactions;

  factory ChatWSEvent.fromJson(Map<String, dynamic> json) {
    final user = json['user'] is Map
        ? Map<String, dynamic>.from(json['user'] as Map)
        : const <String, dynamic>{};
    return ChatWSEvent(
      type: ChatWSEventType.fromWire(stringOrNull(json['event'])),
      conversationId: intOrNull(json['conversationId']),
      message: json['message'] is Map
          ? ChatMessage.fromJson(Map<String, dynamic>.from(json['message'] as Map))
          : null,
      messageId: intOrNull(json['messageId']),
      conversation: json['conversation'] is Map
          ? Conversation.fromJson(Map<String, dynamic>.from(json['conversation'] as Map))
          : null,
      userId: intOrNull(user['userId']),
      userName: stringOrNull(user['name']),
      lastReadMessageId: intOrNull(json['lastReadMessageId']),
      reactions: mapsOr(json['reactions']).map(ChatReaction.fromJson).toList(),
    );
  }
}

/// One realtime socket.
///
/// Messages arrive on [stream]; the caller merges them with its REST state.
/// A dead connection auto-reconnects with a growing backoff, and it stays
/// connected only while a token is available (no token, no socket).
class ChatWebSocketClient {
  ChatWebSocketClient({
    required Uri Function() url,
    required String? Function() token,
    this.onEvent,
  })  : _url = url,
        _token = token;

  final Uri Function() _url;
  final String? Function() _token;

  /// Fires once per frame received, before [stream] listeners.
  void Function(ChatWSEvent event)? onEvent;

  IOWebSocketChannel? _channel;
  StreamSubscription<dynamic>? _readSub;
  Timer? _reconnectTimer;
  Duration _backoff = const Duration(milliseconds: 500);
  bool _manualClose = false;
  bool _reconnecting = false;
  bool _open = false;

  Stream<ChatWSEvent> get stream => _events.stream;
  final StreamController<ChatWSEvent> _events = StreamController.broadcast();
  bool get isConnected => _channel != null && _open;

  /// Open the socket, once per call. Returns immediately; use [isConnected]
  /// or [stream] for the outcome.
  Future<void> connect() async {
    final token = _token();
    if (token == null || token.isEmpty) {
      // No session — nothing to connect for.
      disconnect();
      return;
    }
    if (_reconnecting || _open) return;

    _reconnecting = true;
    try {
      final channel = IOWebSocketChannel.connect(
        _url(),
        headers: {'Authorization': 'Bearer $token'},
      );
      _channel = channel;
      try {
        await channel.ready;
      } catch (_) {
        _channel = null;
        _reconnect();
        return;
      }
      if (_manualClose) {
        channel.sink.close();
        _channel = null;
        return;
      }
      _open = true;
      _backoff = const Duration(milliseconds: 500);
      _readSub = channel.stream.listen(
        _onMessage,
        onDone: _onClosed,
        onError: (error, stackTrace) => _onClosed(),
      );
    } catch (_) {
      _channel = null;
      _reconnect();
    } finally {
      _reconnecting = false;
    }
  }

  /// Stop reconnecting and close the socket.
  void disconnect() {
    _manualClose = true;
    _reconnectTimer?.cancel();
    _reconnectTimer = null;
    _cleanup();
  }

  void _cleanup() {
    _readSub?.cancel();
    _readSub = null;
    final channel = _channel;
    _channel = null;
    _open = false;
    try {
      channel?.sink.close();
    } catch (_) {
      // The connection is already gone.
    }
  }

  void _onMessage(dynamic data) {
    _manualClose = false;
    final json = jsonDecode(data as String);
    if (json is Map) {
      final event = ChatWSEvent.fromJson(Map<String, dynamic>.from(json));
      if (event.type != null) {
        onEvent?.call(event);
        _events.add(event);
      }
    }
  }

  void _onClosed() {
    _cleanup();
    if (_manualClose) return;
    if (_token() == null) {
      // Signed out — no point reconnecting.
      return;
    }
    _reconnect();
  }

  void _reconnect() {
    if (_reconnectTimer != null || _manualClose) return;
    _reconnectTimer = Timer(_backoff, () {
      _reconnectTimer = null;
      if (_backoff < const Duration(seconds: 10)) _backoff *= 2;
      if (!_manualClose && _token() != null) {
        unawaited(connect());
      }
    });
  }
}
