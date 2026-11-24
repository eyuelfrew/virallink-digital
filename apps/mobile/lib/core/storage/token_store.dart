import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Secure, on-device session storage.
///
/// - Access token: short lived (15 minutes by default).
/// - Refresh token: rotated on every refresh; stored securely so a stolen
///   device backup cannot read it.
/// - Cached user: lets the app paint the signed-in shell before `/auth/me`
///   answers, and lets the UI survive a cold start while offline.
///
/// Tokens are also mirrored in memory because every request needs the access
/// token synchronously.
class TokenStore {
  TokenStore({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  static const _accessKey = 'vl_access_token';
  static const _refreshKey = 'vl_refresh_token';
  static const _userKey = 'vl_user_json';

  final FlutterSecureStorage _storage;

  String? _accessToken;
  String? _refreshToken;
  Map<String, dynamic>? _cachedUser;

  String? get accessToken => _accessToken;
  String? get refreshToken => _refreshToken;
  Map<String, dynamic>? get cachedUser => _cachedUser;

  bool get hasSession =>
      (_accessToken != null && _accessToken!.isNotEmpty) ||
      (_refreshToken != null && _refreshToken!.isNotEmpty);

  Future<void> load() async {
    try {
      final values = await _storage.readAll();
      _accessToken = values[_accessKey];
      _refreshToken = values[_refreshKey];

      final rawUser = values[_userKey];
      if (rawUser != null && rawUser.isNotEmpty) {
        final decoded = jsonDecode(rawUser);
        if (decoded is Map) {
          _cachedUser = Map<String, dynamic>.from(decoded);
        }
      }
    } catch (_) {
      // Secure storage can fail on a freshly restored device (keystore key
      // mismatch). Treat that as a signed-out state instead of crashing.
      _accessToken = null;
      _refreshToken = null;
      _cachedUser = null;
    }
  }

  Future<void> saveAccessToken(String token) async {
    _accessToken = token;
    await _storage.write(key: _accessKey, value: token);
  }

  Future<void> saveRefreshToken(String token) async {
    _refreshToken = token;
    await _storage.write(key: _refreshKey, value: token);
  }

  Future<void> saveTokens({
    required String accessToken,
    String? refreshToken,
  }) async {
    _accessToken = accessToken;
    await _storage.write(key: _accessKey, value: accessToken);

    if (refreshToken != null && refreshToken.isNotEmpty) {
      _refreshToken = refreshToken;
      await _storage.write(key: _refreshKey, value: refreshToken);
    }
  }

  Future<void> saveSession({
    required String accessToken,
    required String? refreshToken,
    required Map<String, dynamic> user,
  }) async {
    _accessToken = accessToken;
    _cachedUser = user;

    await _storage.write(key: _accessKey, value: accessToken);
    if (refreshToken != null && refreshToken.isNotEmpty) {
      _refreshToken = refreshToken;
      await _storage.write(key: _refreshKey, value: refreshToken);
    }
    await _storage.write(key: _userKey, value: jsonEncode(user));
  }

  Future<void> saveUser(Map<String, dynamic> user) async {
    _cachedUser = user;
    await _storage.write(key: _userKey, value: jsonEncode(user));
  }

  Future<void> clear() async {
    _accessToken = null;
    _refreshToken = null;
    _cachedUser = null;
    try {
      await _storage.delete(key: _accessKey);
      await _storage.delete(key: _refreshKey);
      await _storage.delete(key: _userKey);
    } catch (_) {
      // Best effort. The in-memory values are already gone.
    }
  }
}
