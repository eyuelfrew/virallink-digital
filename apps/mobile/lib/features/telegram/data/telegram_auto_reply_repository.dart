import '../../../core/network/api_client.dart';
import '../../../core/utils/json.dart';
import '../domain/telegram_auto_reply.dart';

/// Management API for the Telegram auto-reply engine.
///
/// All calls are owner-scoped by the signed-in user's session. Media is
/// uploaded through the shared `/media` endpoint, which returns
/// `{ stored: [...], failed: [...] }`.
class TelegramAutoReplyRepository {
  TelegramAutoReplyRepository(this._api);

  final ApiClient _api;

  Future<List<TelegramAutoReplyAccount>> accounts() async {
    final response = await _api.get('/telegram-auto-reply');
    return response.asList
        .whereType<Map>()
        .map((row) => TelegramAutoReplyAccount.fromJson(Map<String, dynamic>.from(row)))
        .toList(growable: false);
  }

  Future<List<TelegramRule>> rules(int accountId) async {
    final response = await _api.get('/telegram-auto-reply/$accountId/rules');
    return response.asList
        .whereType<Map>()
        .map((row) => TelegramRule.fromJson(Map<String, dynamic>.from(row)))
        .toList(growable: false);
  }

  Future<TelegramRule> saveRule(
    int accountId, {
    int? ruleId,
    required Map<String, dynamic> body,
  }) async {
    final response = ruleId == null
        ? await _api.post('/telegram-auto-reply/$accountId/rules', body: body)
        : await _api.put('/telegram-auto-reply/$accountId/rules/$ruleId', body: body);
    return TelegramRule.fromJson(response.asMap);
  }

  Future<void> deleteRule(int accountId, int ruleId) async {
    await _api.delete('/telegram-auto-reply/$accountId/rules/$ruleId');
  }

  Future<TelegramAutoReplySettings> saveSettings(
    int accountId,
    Map<String, dynamic> body,
  ) async {
    final response = await _api.put(
      '/telegram-auto-reply/$accountId/settings',
      body: body,
    );
    return TelegramAutoReplySettings.fromJson(response.asMap);
  }

  Future<List<TelegramCatalogItem>> catalog() async {
    final response = await _api.get('/telegram-auto-reply/catalog');
    return response.asList
        .whereType<Map>()
        .map((row) => TelegramCatalogItem.fromJson(Map<String, dynamic>.from(row)))
        .toList(growable: false);
  }

  Future<TelegramCatalogItem> saveCatalogItem({
    int? itemId,
    required Map<String, dynamic> body,
  }) async {
    final response = itemId == null
        ? await _api.post('/telegram-auto-reply/catalog', body: body)
        : await _api.put('/telegram-auto-reply/catalog/$itemId', body: body);
    return TelegramCatalogItem.fromJson(response.asMap);
  }

  Future<void> deleteCatalogItem(int itemId) async {
    await _api.delete('/telegram-auto-reply/catalog/$itemId');
  }

  /// Upload one image/audio file and return the stored media id.
  Future<TelegramMedia> uploadMedia(String filePath, {required String folder}) async {
    final response = await _api.upload(
      '/media',
      filePath: filePath,
      field: 'files',
      fields: {'folder': folder},
    );
    final stored = response.asMap['stored'];
    if (stored is List && stored.isNotEmpty) {
      return TelegramMedia.fromJson(mapOr(stored.first));
    }
    throw StateError('The server did not return a stored media record.');
  }

  Future<Map<String, dynamic>> preview(int accountId, String text) async {
    final response = await _api.get(
      '/telegram-auto-reply/$accountId/preview',
      query: {'text': text},
    );
    return response.asMap;
  }
}
