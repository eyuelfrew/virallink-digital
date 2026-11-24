import '../../../core/network/api_client.dart';
import '../domain/telegram_account_status.dart';

/// Talks to `/api/v1/telegram-auto-reply/account/*`.
///
/// Every call is authenticated only — no special permission is required
/// beyond being signed in, because a person may always link their own
/// Telegram account.
class TelegramAccountRepository {
  TelegramAccountRepository(this._api);

  final ApiClient _api;

  Future<TelegramAccountStatus> status() async {
    final response = await _api.get('/telegram-auto-reply/account/status');
    return TelegramAccountStatus.fromJson(response.asMap);
  }

  Future<TelegramAccountStatus> saveConfig({
    required int apiId,
    required String apiHash,
    required String phoneNumber,
  }) async {
    final response = await _api.put(
      '/telegram-auto-reply/account/config',
      body: {
        'apiId': apiId,
        'apiHash': apiHash.trim(),
        'phoneNumber': phoneNumber.trim(),
      },
    );
    return TelegramAccountStatus.fromJson(response.asMap);
  }

  Future<TelegramAccountStatus> sendCode() async {
    final response = await _api.post('/telegram-auto-reply/account/send-code');
    return TelegramAccountStatus.fromJson(response.asMap);
  }

  Future<TelegramAccountStatus> verifyCode(String code) async {
    final response = await _api.post(
      '/telegram-auto-reply/account/verify-code',
      body: {'code': code.trim()},
    );
    return TelegramAccountStatus.fromJson(response.asMap);
  }

  Future<TelegramAccountStatus> verifyPassword(String password) async {
    final response = await _api.post(
      '/telegram-auto-reply/account/verify-password',
      body: {'password': password},
    );
    return TelegramAccountStatus.fromJson(response.asMap);
  }

  Future<TelegramAccountStatus> cancelLogin() async {
    final response =
        await _api.post('/telegram-auto-reply/account/cancel-login');
    return TelegramAccountStatus.fromJson(response.asMap);
  }

  Future<TelegramAccountStatus> connect() async {
    final response = await _api.post('/telegram-auto-reply/account/connect');
    return TelegramAccountStatus.fromJson(response.asMap);
  }

  Future<TelegramAccountStatus> disconnect() async {
    final response = await _api.post('/telegram-auto-reply/account/disconnect');
    return TelegramAccountStatus.fromJson(response.asMap);
  }

  Future<TelegramAccountStatus> clearSession() async {
    final response =
        await _api.delete('/telegram-auto-reply/account/session');
    return TelegramAccountStatus.fromJson(response.asMap);
  }

  Future<TelegramAccountStatus> resetConfig() async {
    final response =
        await _api.delete('/telegram-auto-reply/account/config');
    return TelegramAccountStatus.fromJson(response.asMap);
  }
}
