import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/storage/token_store.dart';
import '../../../core/utils/json.dart';
import '../domain/app_user.dart';

class AuthRepository {
  AuthRepository(this._api, this._tokens);

  final ApiClient _api;
  final TokenStore _tokens;

  Future<bool> needsSetup() async {
    final response = await _api.get('/auth/setup-status');
    return boolOr(response.asMap['needsSetup']);
  }

  Future<void> setup({
    required String name,
    required String identifier,
    required String password,
  }) async {
    await _api.post(
      '/auth/setup',
      body: {'name': name, 'identifier': identifier.trim(), 'password': password},
    );
  }

  Future<AppUser> login({
    required String identifier,
    required String password,
  }) async {
    final response = await _api.post(
      '/auth/login',
      body: {'identifier': identifier.trim(), 'password': password},
    );

    final data = response.asMap;
    final userJson = mapOr(data['user']);
    final accessToken = stringOrNull(data['accessToken']);

    if (accessToken == null || userJson.isEmpty) {
      throw const ApiException(
        message: 'The service returned an incomplete sign-in response.',
        code: 'BAD_RESPONSE',
      );
    }

    // The refresh token was already captured from Set-Cookie by ApiClient.
    await _tokens.saveSession(
      accessToken: accessToken,
      refreshToken: _tokens.refreshToken,
      user: userJson,
    );

    return AppUser.fromJson(userJson);
  }

  Future<AppUser> me() async {
    final response = await _api.get('/auth/me');
    final userJson = mapOr(response.asMap['user']);
    if (userJson.isEmpty) {
      throw const ApiException(
        message: 'The service returned an empty profile.',
        code: 'BAD_RESPONSE',
      );
    }
    final user = AppUser.fromJson(userJson);
    await _tokens.saveUser(user.toJson());
    return user;
  }

  Future<void> logout() async {
    try {
      await _api.post('/auth/logout');
    } catch (_) {
      // A dead session still needs to be removed from the device.
    } finally {
      await _tokens.clear();
    }
  }

  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    await _api.post(
      '/auth/change-password',
      body: {'currentPassword': currentPassword, 'newPassword': newPassword},
    );
    await _tokens.clear();
  }

  Future<void> changeHandles({
    required String currentPassword,
    required String? email,
    required String? username,
    required String? phone,
  }) async {
    await _api.put(
      '/auth/handles',
      body: {
        'currentPassword': currentPassword,
        'email': email,
        'username': username,
        'phone': phone,
      },
    );
  }

  Future<void> signOutLocally() => _tokens.clear();
}
