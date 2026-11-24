import 'package:flutter_test/flutter_test.dart';
import 'package:virallink_mobile/core/config/app_config.dart';
import 'package:virallink_mobile/core/utils/formatters.dart';

void main() {
  group('AppConfig', () {
    test('defaults to the local API on localhost', () {
      expect(AppConfig.useProduction, isFalse);
      expect(AppConfig.isLocal, isTrue);
      expect(AppConfig.environmentLabel, 'Local');
      expect(AppConfig.apiBaseUrl, contains('localhost'));
      expect(AppConfig.apiBaseUrl, contains(':4000/api/v1'));
      // Android uses `adb reverse`, so the emulator host alias must not appear.
      expect(AppConfig.apiBaseUrl, isNot(contains('10.0.2.2')));
    });

    test('apiOrigin strips the /api/v1 suffix', () {
      expect(AppConfig.apiOrigin, isNot(contains('/api/v1')));
      expect(AppConfig.apiOrigin, startsWith('http://localhost:4000'));
    });

    test('resolves media paths against the API media route', () {
      // The API serves stored files from /api/v1/media/<key>, not /media/<key>
      // (that path belongs to the public website).
      expect(
        AppConfig.resolveMediaUrl('/media/2026/01/photo.webp'),
        'http://localhost:4000/api/v1/media/2026/01/photo.webp',
      );
      expect(
        AppConfig.resolveMediaUrl('media/2026/01/photo.webp'),
        'http://localhost:4000/api/v1/media/2026/01/photo.webp',
      );
      expect(
        AppConfig.resolveMediaUrl('https://cdn.example.com/a.png'),
        'https://cdn.example.com/a.png',
      );
      expect(AppConfig.resolveMediaUrl(null), '');
    });
  });

  group('AppFormat', () {
    test('formats integer minor units as currency', () {
      expect(AppFormat.cents(125000), contains('1,250.00'));
      expect(AppFormat.cents(null), '—');
    });

    test('formats dates from API strings', () {
      expect(AppFormat.date('2026-01-05T10:00:00.000Z'), '5 Jan 2026');
      expect(AppFormat.date(null), '—');
    });
  });
}
