import 'package:flutter_test/flutter_test.dart';
import 'package:virallink_mobile/features/telegram/domain/telegram_auto_reply.dart';

void main() {
  group('Telegram auto-reply models', () {
    test('settings parse 0/1 booleans and keep cooldown', () {
      final settings = TelegramAutoReplySettings.fromJson({
        'isEnabled': 1,
        'awayMode': 0,
        'awayCooldownMinutes': 60,
        'replyToNewChats': 1,
        'replyToReturningChats': 0,
        'catalogIntro': 'Welcome',
      });

      expect(settings.isEnabled, isTrue);
      expect(settings.awayMode, isFalse);
      expect(settings.awayCooldownMinutes, 60);
      expect(settings.replyToNewChats, isTrue);
      expect(settings.replyToReturningChats, isFalse);
      expect(settings.catalogIntro, 'Welcome');
    });

    test('rule parses image ids, audio id and attached media', () {
      final rule = TelegramRule.fromJson({
        'id': 7,
        'accountId': 2,
        'name': 'price',
        'trigger': 'exact',
        'keywords': 'spc',
        'replyText': 'Price: 1500',
        'imageMediaIds': [12, '13', 12],
        'audioMediaId': 9,
        'stopProcessing': 1,
        'images': [
          {'id': 12, 'url': '/media/a.jpg', 'kind': 'image', 'mimeType': 'image/jpeg'},
        ],
      });

      expect(rule.id, 7);
      expect(rule.trigger, 'exact');
      expect(rule.imageMediaIds, [12, 13]);
      expect(rule.audioMediaId, 9);
      expect(rule.stopProcessing, isTrue);
      expect(rule.images.single.url, '/media/a.jpg');
    });

    test('rule payload uses the API field names', () {
      final json = TelegramRule(
        id: 0,
        name: 'greeting',
        trigger: 'exact',
        keywords: 'hi',
        replyText: 'Hello!',
        imageMediaIds: const [4],
        audioMediaId: null,
      ).toJson();

      expect(json['name'], 'greeting');
      expect(json['imageMediaIds'], [4]);
      expect(json.containsKey('audioMediaId'), isTrue);
      expect(json['trigger'], 'exact');
    });

    test('catalog item handles string price from DECIMAL', () {
      final item = TelegramCatalogItem.fromJson({
        'id': 3,
        'name': 'Service',
        'price': '1500.00',
        'currency': 'ETB',
        'imageMediaIds': [8],
      });

      expect(item.price, '1500.00');
      expect(item.currency, 'ETB');
      expect(item.imageMediaIds, [8]);
      expect(item.isActive, isTrue);
    });
  });
}
