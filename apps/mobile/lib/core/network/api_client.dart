import 'package:dio/dio.dart';

import '../config/app_config.dart';
import '../storage/token_store.dart';
import 'api_exception.dart';
import 'api_response.dart';

/// Thin, typed wrapper around the Virallink REST API.
///
/// Responsibilities kept in one place:
/// - attach `Authorization: Bearer <accessToken>`
/// - capture the rotated `vl_refresh` cookie returned by login/refresh
/// - refresh once on a 401 and replay the original request
/// - convert every failure into an [ApiException]
///
/// Native iOS/Android HTTP stacks do not enforce CORS, so the app can call the
/// Express API directly. The API accepts a bearer token as well as the web
/// app's httpOnly cookies.
class ApiClient {
  ApiClient({required TokenStore tokenStore, String? baseUrl})
    : _tokens = tokenStore,
      _baseUrl = baseUrl ?? AppConfig.apiBaseUrl {
    _dio = Dio(
      BaseOptions(
        baseUrl: _baseUrl,
        connectTimeout: AppConfig.connectTimeout,
        receiveTimeout: AppConfig.receiveTimeout,
        sendTimeout: AppConfig.receiveTimeout,
        headers: const {'Accept': 'application/json'},
        responseType: ResponseType.json,
      ),
    );

    _refreshDio = Dio(
      BaseOptions(
        baseUrl: _baseUrl,
        connectTimeout: AppConfig.connectTimeout,
        receiveTimeout: AppConfig.receiveTimeout,
        headers: const {'Accept': 'application/json'},
        responseType: ResponseType.json,
      ),
    );

    _dio.interceptors.add(
      QueuedInterceptorsWrapper(
        onRequest: (options, handler) {
          final token = _tokens.accessToken;
          if (token != null &&
              token.isNotEmpty &&
              !_isCredentialPath(options.path)) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          handler.next(options);
        },
        onError: (error, handler) async {
          final path = error.requestOptions.path;
          final status = error.response?.statusCode;
          final alreadyRetried = error.requestOptions.extra['retried'] == true;

          if (status == 401 && !alreadyRetried && !_isCredentialPath(path)) {
            final refreshed = await _refreshTokens();
            if (refreshed) {
              final request = error.requestOptions;
              request.extra['retried'] = true;
              request.headers['Authorization'] =
                  'Bearer ${_tokens.accessToken}';
              try {
                final response = await _dio.fetch(request);
                handler.resolve(response);
                return;
              } catch (_) {
                // Fall through to the original error if the replay fails.
              }
            } else {
              onSessionExpired?.call();
            }
          }

          handler.next(error);
        },
      ),
    );
  }

  final TokenStore _tokens;
  final String _baseUrl;

  late final Dio _dio;
  late final Dio _refreshDio;

  Future<bool>? _refreshInFlight;

  /// Called once when a refresh is impossible and the session is dead.
  void Function()? onSessionExpired;

  String get baseUrl => _baseUrl;

  Future<ApiResponse> get(String path, {Map<String, dynamic>? query}) =>
      _send('GET', path, query: query);

  Future<ApiResponse> post(
    String path, {
    Object? body,
    Map<String, dynamic>? query,
  }) => _send('POST', path, body: body, query: query);

  Future<ApiResponse> put(
    String path, {
    Object? body,
    Map<String, dynamic>? query,
  }) => _send('PUT', path, body: body, query: query);

  Future<ApiResponse> patch(
    String path, {
    Object? body,
    Map<String, dynamic>? query,
  }) => _send('PATCH', path, body: body, query: query);

  Future<ApiResponse> delete(
    String path, {
    Object? body,
    Map<String, dynamic>? query,
  }) => _send('DELETE', path, body: body, query: query);

  /// Upload a file with multipart form data (chat image upload).
  ///
  /// The refresh/rotation logic and 401 replay are shared with [_send]; a
  /// multipart body cannot use the JSON request path because `contentType`
  /// would overwrite the browser-generated boundary.
  Future<ApiResponse> upload(
    String path, {
    required String filePath,
    required String field,
    Map<String, dynamic>? fields,
  }) async {
    final fileName = filePath.split('/').last;
    final formData = FormData.fromMap(<String, dynamic>{
      if (fields != null) ...fields,
      field: await MultipartFile.fromFile(filePath, filename: fileName),
    });
    try {
      final response = await _dio.post(path, data: formData);
      await _captureRefreshToken(response);
      final payload = response.data;
      if (payload is Map) {
        final map = Map<String, dynamic>.from(payload);
        return ApiResponse(
          data: map['data'],
          meta: _asMap(map['meta']),
          totals: _asMap(map['totals']),
        );
      }
      return ApiResponse(data: payload);
    } on DioException catch (error) {
      final response = error.response;
      if (response != null) {
        await _captureRefreshToken(response);
      }
      throw ApiException.fromDio(error);
    }
  }

  Future<ApiResponse> _send(
    String method,
    String path, {
    Object? body,
    Map<String, dynamic>? query,
  }) async {
    try {
      final response = await _dio.request<dynamic>(
        path,
        data: body,
        queryParameters: query,
        options: Options(
          method: method,
          contentType: body == null ? null : Headers.jsonContentType,
        ),
      );

      await _captureRefreshToken(response);

      final payload = response.data;
      if (payload is Map) {
        final map = Map<String, dynamic>.from(payload);
        return ApiResponse(
          data: map['data'],
          meta: _asMap(map['meta']),
          totals: _asMap(map['totals']),
        );
      }

      return ApiResponse(data: payload);
    } on DioException catch (error) {
      final response = error.response;
      if (response != null) {
        await _captureRefreshToken(response);
      }
      throw ApiException.fromDio(error);
    }
  }

  /// Refreshes the access token using the stored refresh token.
  ///
  /// The API accepts the token either as the `vl_refresh` cookie or as
  /// `{ "refreshToken": "..." }` in the body. Both are sent: the body is the
  /// reliable path for a native client, the cookie covers proxies that expect
  /// the browser flow.
  Future<bool> _refreshTokens() {
    final existing = _refreshInFlight;
    if (existing != null) return existing;

    final future = _performRefresh();
    _refreshInFlight = future;
    future.whenComplete(() {
      if (identical(_refreshInFlight, future)) _refreshInFlight = null;
    });
    return future;
  }

  Future<bool> _performRefresh() async {
    final refreshToken = _tokens.refreshToken;
    if (refreshToken == null || refreshToken.isEmpty) return false;

    try {
      final response = await _refreshDio.post<dynamic>(
        '/auth/refresh',
        data: {'refreshToken': refreshToken},
        options: Options(
          contentType: Headers.jsonContentType,
          headers: {'Cookie': 'vl_refresh=$refreshToken'},
        ),
      );

      final payload = response.data;
      final data = payload is Map ? payload['data'] : null;
      final accessToken = data is Map ? data['accessToken'] : null;

      if (accessToken is! String || accessToken.isEmpty) return false;

      final rotated = _extractRefreshToken(response) ?? refreshToken;
      await _tokens.saveTokens(accessToken: accessToken, refreshToken: rotated);
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<void> _captureRefreshToken(Response<dynamic> response) async {
    final token = _extractRefreshToken(response);
    if (token != null && token.isNotEmpty) {
      await _tokens.saveRefreshToken(token);
    }
  }

  /// Reads `Set-Cookie: vl_refresh=...` from a response.
  ///
  /// `HttpOnly` only hides the cookie from JavaScript in a browser; a native
  /// HTTP client still receives the header, which is how the mobile app keeps
  /// its rotating refresh token.
  String? _extractRefreshToken(Response<dynamic> response) {
    final raw = response.headers.map['set-cookie'];
    if (raw == null) return null;

    for (final header in raw) {
      final match = RegExp(
        r'(?:^|[;,\s])vl_refresh=([^;,\s]+)',
      ).firstMatch(header);
      final value = match?.group(1);
      if (value != null && value.isNotEmpty) return value;
    }
    return null;
  }

  bool _isCredentialPath(String path) {
    return path.contains('/auth/login') ||
        path.contains('/auth/refresh') ||
        path.contains('/auth/setup') ||
        path.contains('/auth/forgot-password') ||
        path.contains('/auth/reset-password');
  }

  Map<String, dynamic>? _asMap(dynamic value) {
    if (value is Map<String, dynamic>) return value;
    if (value is Map) return Map<String, dynamic>.from(value);
    return null;
  }

  /// Cheap connectivity probe used by the offline screen.
  ///
  /// `/health` lives outside `/api/v1`, so this uses the API origin.
  Future<bool> checkHealth() async {
    try {
      final response = await _refreshDio.get<dynamic>(
        '${AppConfig.apiOrigin}/health',
        options: Options(receiveTimeout: const Duration(seconds: 5)),
      );
      return response.statusCode != null &&
          response.statusCode! >= 200 &&
          response.statusCode! < 300;
    } catch (_) {
      return false;
    }
  }
}
