import '../../utils/json.dart';
import 'chat_message.dart';

/// One member of a conversation, as returned by the chat API.
class ChatMember {
  const ChatMember({required this.userId, this.name, this.lastReadMessageId});

  final int userId;
  final String? name;
  final int? lastReadMessageId;

  factory ChatMember.fromJson(Map<String, dynamic> json) => ChatMember(
    userId: intOr(json['userId']),
    name: stringOrNull(json['name']),
    lastReadMessageId: intOrNull(json['lastReadMessageId']),
  );
}

/// A private 1:1 chat or a titled group.
class Conversation {
  const Conversation({
    required this.id,
    required this.isGroup,
    this.title,
    this.lastMessageAt,
    this.members = const [],
    this.peer,
    this.lastMessage,
    this.unreadCount = 0,
    this.pinnedAt,
  });

  final int id;
  final bool isGroup;
  final String? title;
  final String? lastMessageAt;
  final List<ChatMember> members;
  final ChatMember? peer;
  final ChatMessage? lastMessage;
  final int unreadCount;
  final DateTime? pinnedAt;

  /// Group title, or the peer's name for private chats.
  String get displayName =>
      isGroup ? title ?? 'Group' : peer?.name ?? 'Team member';

  bool get hasUnread => unreadCount > 0;

  factory Conversation.fromJson(Map<String, dynamic> json) => Conversation(
    id: intOr(json['id']),
    isGroup: boolOr(json['isGroup']),
    title: stringOrNull(json['title']),
    lastMessageAt: stringOrNull(json['lastMessageAt']),
    members: mapsOr(json['members']).map(ChatMember.fromJson).toList(),
    peer: json['peer'] is Map
        ? ChatMember.fromJson(Map<String, dynamic>.from(json['peer'] as Map))
        : null,
    lastMessage: json['lastMessage'] is Map
        ? ChatMessage.fromJson(
            Map<String, dynamic>.from(json['lastMessage'] as Map),
          )
        : null,
    unreadCount: intOr(json['unreadCount']),
    pinnedAt: dateOrNull(json['pinnedAt']),
  );
}
