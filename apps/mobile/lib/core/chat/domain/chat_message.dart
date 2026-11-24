import '../../utils/json.dart';

/// Image attached to a chat message, as returned by the chat upload/uploaded-image API.
class ChatImage {
  const ChatImage({
    required this.id,
    this.url,
    this.width,
    this.height,
    this.blurDataUrl,
    this.mimeType,
    this.kind,
    this.title,
    this.altText,
    this.caption,
  });

  final int id;
  final String? url;
  final int? width;
  final int? height;
  final String? blurDataUrl;
  final String? mimeType;
  final String? kind;
  final String? title;
  final String? altText;
  final String? caption;

  factory ChatImage.fromJson(Map<String, dynamic> json) => ChatImage(
        id: intOr(json['id']),
        url: stringOrNull(json['url']),
        width: intOrNull(json['width']),
        height: intOrNull(json['height']),
        blurDataUrl: stringOrNull(json['blurDataUrl']),
        mimeType: stringOrNull(json['mimeType']),
        kind: stringOrNull(json['kind']),
        title: stringOrNull(json['title']),
        altText: stringOrNull(json['altText']),
        caption: stringOrNull(json['caption']),
      );
}

/// One member who has read the message so far.
class ChatReader {
  const ChatReader({required this.userId, this.name});

  final int userId;
  final String? name;

  factory ChatReader.fromJson(Map<String, dynamic> json) => ChatReader(
        userId: intOr(json['userId']),
        name: stringOrNull(json['name']),
      );
}

/// One emoji reaction on a message.
class ChatReaction {
  const ChatReaction({
    required this.emoji,
    required this.userId,
    this.name,
    this.createdAt,
  });

  final String emoji;
  final int userId;
  final String? name;
  final String? createdAt;

  factory ChatReaction.fromJson(Map<String, dynamic> json) => ChatReaction(
        emoji: stringOr(json['emoji']),
        userId: intOr(json['userId']),
        name: stringOrNull(json['name']),
        createdAt: stringOrNull(json['createdAt']),
      );
}

/// One message in a conversation.
class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.conversationId,
    this.userId = 0,
    this.senderName,
    this.text,
    this.image,
    this.editedAt,
    this.replyToId,
    this.createdAt,
    this.readBy = const [],
    this.reactions = const [],
  });

  final int id;
  final int conversationId;
  final int userId;
  final String? senderName;
  final String? text;
  final ChatImage? image;
  final String? editedAt;
  final int? replyToId;
  final String? createdAt;
  final List<ChatReader> readBy;
  final List<ChatReaction> reactions;

  bool get hasEdited => editedAt != null;

  bool get hasImage => image != null;

  bool hasReaction(int userId, {String? emoji}) => reactions.any(
        (reaction) => reaction.userId == userId && (emoji == null || reaction.emoji == emoji),
      );

  ChatMessage copyWith({
    List<ChatReaction>? reactions,
    List<ChatReader>? readBy,
  }) => ChatMessage(
        id: id,
        conversationId: conversationId,
        userId: userId,
        senderName: senderName,
        text: text,
        image: image,
        editedAt: editedAt,
        replyToId: replyToId,
        createdAt: createdAt,
        readBy: readBy ?? this.readBy,
        reactions: reactions ?? this.reactions,
      );

  factory ChatMessage.fromJson(Map<String, dynamic> json) => ChatMessage(
        id: intOr(json['id']),
        conversationId: intOr(json['conversationId']),
        userId: intOr(json['userId']),
        senderName: stringOrNull(json['senderName']),
        text: stringOrNull(json['text']),
        image: json['image'] is Map
            ? ChatImage.fromJson(Map<String, dynamic>.from(json['image'] as Map))
            : null,
        // The API serialises the timestamp as `edited`; older payloads used
        // `editedAt`, so accept both.
        editedAt: stringOrNull(json['edited']) ?? stringOrNull(json['editedAt']),
        replyToId: intOrNull(json['replyToId']),
        createdAt: stringOrNull(json['createdAt']),
        readBy: mapsOr(json['readBy']).map(ChatReader.fromJson).toList(),
        reactions: mapsOr(json['reactions']).map(ChatReaction.fromJson).toList(),
      );
}
