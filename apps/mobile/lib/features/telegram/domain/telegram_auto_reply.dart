import '../../../core/utils/json.dart';

/// A media record returned by `POST /media` or attached to a rule/catalog item.
class TelegramMedia {
  const TelegramMedia({
    required this.id,
    this.url = '',
    this.kind = '',
    this.mimeType = '',
  });

  final int id;
  final String url;
  final String kind;
  final String mimeType;

  factory TelegramMedia.fromJson(Map<String, dynamic> json) {
    return TelegramMedia(
      id: intOr(json['id']),
      url: stringOr(json['url']),
      kind: stringOr(json['kind']),
      mimeType: stringOr(json['mimeType']),
    );
  }
}

/// One auto-reply connection (bot token or personal Telegram account).
class TelegramAutoReplyAccount {
  const TelegramAutoReplyAccount({
    required this.id,
    this.name = '',
    this.provider = '',
    this.botUsername = '',
    this.isActive = true,
    this.isCompany = false,
    this.connectionStatus = '',
    this.lastError,
    this.settings,
  });

  final int id;
  final String name;
  final String provider;
  final String botUsername;
  final bool isActive;
  final bool isCompany;
  final String connectionStatus;
  final String? lastError;
  final TelegramAutoReplySettings? settings;

  String get displayName => name.isEmpty ? 'Telegram connection #$id' : name;

  factory TelegramAutoReplyAccount.fromJson(Map<String, dynamic> json) {
    return TelegramAutoReplyAccount(
      id: intOr(json['id']),
      name: stringOr(json['name']),
      provider: stringOr(json['provider']),
      botUsername: stringOr(json['botUsername']),
      isActive: boolOr(json['isActive'], true),
      isCompany: boolOr(json['isCompany']),
      connectionStatus: stringOr(json['connectionStatus']),
      lastError: stringOrNull(json['lastError']),
      settings: json['settings'] is Map
          ? TelegramAutoReplySettings.fromJson(mapOr(json['settings']))
          : null,
    );
  }
}

/// Per-account auto-reply settings.
class TelegramAutoReplySettings {
  const TelegramAutoReplySettings({
    this.isEnabled = true,
    this.welcomeMessage = '',
    this.awayMessage = '',
    this.awayMode = true,
    this.awayCooldownMinutes = 360,
    this.catalogEnabled = true,
    this.catalogIntro = '',
    this.menuEnabled = false,
    this.menuTitle = '',
    this.replyToNewChats = true,
    this.replyToReturningChats = true,
  });

  final bool isEnabled;
  final String welcomeMessage;
  final String awayMessage;
  final bool awayMode;
  final int awayCooldownMinutes;
  final bool catalogEnabled;
  final String catalogIntro;
  final bool menuEnabled;
  final String menuTitle;
  final bool replyToNewChats;
  final bool replyToReturningChats;

  factory TelegramAutoReplySettings.fromJson(Map<String, dynamic> json) {
    return TelegramAutoReplySettings(
      isEnabled: boolOr(json['isEnabled'], true),
      welcomeMessage: stringOr(json['welcomeMessage']),
      awayMessage: stringOr(json['awayMessage']),
      awayMode: boolOr(json['awayMode'], true),
      awayCooldownMinutes: intOr(json['awayCooldownMinutes'], 360),
      catalogEnabled: boolOr(json['catalogEnabled'], true),
      catalogIntro: stringOr(json['catalogIntro']),
      menuEnabled: boolOr(json['menuEnabled']),
      menuTitle: stringOr(json['menuTitle']),
      replyToNewChats: boolOr(json['replyToNewChats'], true),
      replyToReturningChats: boolOr(json['replyToReturningChats'], true),
    );
  }

  Map<String, dynamic> toJson() => {
        'isEnabled': isEnabled,
        'welcomeMessage': welcomeMessage,
        'awayMessage': awayMessage,
        'awayMode': awayMode,
        'awayCooldownMinutes': awayCooldownMinutes,
        'catalogEnabled': catalogEnabled,
        'catalogIntro': catalogIntro,
        'menuEnabled': menuEnabled,
        'menuTitle': menuTitle,
        'replyToNewChats': replyToNewChats,
        'replyToReturningChats': replyToReturningChats,
      };
}

/// A conditional reply rule, including its attached images and audio.
class TelegramRule {
  const TelegramRule({
    required this.id,
    this.accountId = 0,
    this.name = '',
    this.trigger = 'exact',
    this.keywords = '',
    this.replyText = '',
    this.imageMediaIds = const [],
    this.audioMediaId,
    this.sendCatalog = false,
    this.showMenu = false,
    this.cooldownMinutes = 0,
    this.priority = 0,
    this.stopProcessing = true,
    this.isActive = true,
    this.images = const [],
  });

  final int id;
  final int accountId;
  final String name;
  final String trigger;
  final String keywords;
  final String replyText;
  final List<int> imageMediaIds;
  final int? audioMediaId;
  final bool sendCatalog;
  final bool showMenu;
  final int cooldownMinutes;
  final int priority;
  final bool stopProcessing;
  final bool isActive;
  final List<TelegramMedia> images;

  factory TelegramRule.fromJson(Map<String, dynamic> json) {
    return TelegramRule(
      id: intOr(json['id']),
      accountId: intOr(json['accountId']),
      name: stringOr(json['name']),
      trigger: stringOr(json['trigger'], 'exact'),
      keywords: stringOr(json['keywords']),
      replyText: stringOr(json['replyText']),
      imageMediaIds: (json['imageMediaIds'] is List)
          ? (json['imageMediaIds'] as List)
              .map((value) => intOr(value))
              .where((id) => id > 0)
              .toSet()
              .toList(growable: false)
          : const [],
      audioMediaId: intOrNull(json['audioMediaId']),
      sendCatalog: boolOr(json['sendCatalog']),
      showMenu: boolOr(json['showMenu']),
      cooldownMinutes: intOr(json['cooldownMinutes']),
      priority: intOr(json['priority']),
      stopProcessing: boolOr(json['stopProcessing'], true),
      isActive: boolOr(json['isActive'], true),
      images: mapsOr(json['images'])
          .map(TelegramMedia.fromJson)
          .toList(growable: false),
    );
  }

  Map<String, dynamic> toJson() => {
        'name': name.trim(),
        'trigger': trigger,
        'keywords': keywords.trim(),
        'replyText': replyText,
        'imageMediaIds': imageMediaIds,
        'audioMediaId': audioMediaId,
        'sendCatalog': sendCatalog,
        'showMenu': showMenu,
        'cooldownMinutes': cooldownMinutes,
        'priority': priority,
        'stopProcessing': stopProcessing,
        'isActive': isActive,
      };
}

/// A product/service in the global Telegram catalog.
class TelegramCatalogItem {
  const TelegramCatalogItem({
    required this.id,
    this.name = '',
    this.description = '',
    this.price = '',
    this.currency = 'ETB',
    this.imageMediaId,
    this.imageMediaIds = const [],
    this.isActive = true,
    this.displayOrder = 0,
  });

  final int id;
  final String name;
  final String description;
  final String price;
  final String currency;
  final int? imageMediaId;
  final List<int> imageMediaIds;
  final bool isActive;
  final int displayOrder;

  factory TelegramCatalogItem.fromJson(Map<String, dynamic> json) {
    return TelegramCatalogItem(
      id: intOr(json['id']),
      name: stringOr(json['name']),
      description: stringOr(json['description']),
      price: stringOr(json['price']),
      currency: stringOr(json['currency'], 'ETB'),
      imageMediaId: intOrNull(json['imageMediaId']),
      imageMediaIds: (json['imageMediaIds'] is List)
          ? (json['imageMediaIds'] as List)
              .map((value) => intOr(value))
              .where((id) => id > 0)
              .toSet()
              .toList(growable: false)
          : const [],
      isActive: boolOr(json['isActive'], true),
      displayOrder: intOr(json['displayOrder']),
    );
  }

  Map<String, dynamic> toJson() => {
        'name': name.trim(),
        'description': description.trim(),
        'price': price.trim(),
        'currency': currency.trim().isEmpty ? 'ETB' : currency.trim(),
        'imageMediaId': imageMediaId,
        'imageMediaIds': imageMediaIds,
        'isActive': isActive,
        'displayOrder': displayOrder,
      };
}
