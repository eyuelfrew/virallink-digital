/// Runtime configuration for the Virallink mobile app.
///
/// The whole app talks to one API. Switching between the local Express server
/// and the deployed one is a single boolean — [useProduction] — so there is no
/// chance of a build pointing at two different hosts.
///
/// Local development deliberately uses `localhost`, not `10.0.2.2`. The API is
/// reached through a reversed port (`adb reverse tcp:4000 tcp:4000` on Android,
/// the simulator's shared loopback on iOS), which keeps one URL working on both
/// platforms and on a physical device connected over USB.
///
/// Override without editing this file:
///
/// ```sh
/// flutter run --dart-define=USE_PRODUCTION=true
/// flutter run --dart-define=LOCAL_API_BASE_URL=http://localhost:4000/api/v1
/// ```
class AppConfig {
  AppConfig._();

  /// false → local API, true → production API.
  ///
  /// This is the only switch that decides which backend the app uses.
  static const bool useProduction = bool.fromEnvironment(
    'USE_PRODUCTION',
    defaultValue: false,
  );

  /// Deployed API. Replace the host with the real production origin before
  /// shipping (it can also be supplied with `--dart-define`).
  static const String _productionApiBaseUrl = String.fromEnvironment(
    'PRODUCTION_API_BASE_URL',
    defaultValue: 'https://api.yourdomain.com/api/v1',
  );

  /// Local Express API. Port 4000 matches `apps/api` (`PORT=4000`).
  static const String _localApiBaseUrl = String.fromEnvironment(
    'LOCAL_API_BASE_URL',
    defaultValue: 'http://localhost:4000/api/v1',
  );

  static String get apiBaseUrl =>
      useProduction ? _productionApiBaseUrl : _localApiBaseUrl;

  /// The API origin without the `/api/v1` suffix, used to resolve media paths
  /// such as `/media/2026/01/photo.webp` returned by the API.
  static String get apiOrigin {
    final base = apiBaseUrl.replaceAll(RegExp(r'/+$'), '');
    return base.replaceAll(RegExp(r'/api/v1$'), '');
  }

  /// The realtime chat socket endpoint — `ws(s)://host:port/api/v1/chat/ws`.
  ///
  /// Derived from [apiBaseUrl] so local and production both work through one
  /// constant. The API attaches its WebSocket server to the same port as the
  /// REST API.
  static String get wsEndpoint {
    final base = apiBaseUrl.replaceAll(RegExp(r'/+$'), '');
    final scheme = base.startsWith('https://') ? 'wss://' : 'ws://';
    final host = base.replaceFirst(RegExp(r'^https?://'), '');
    return '$scheme$host/api/v1/chat/ws';
  }

  static bool get isLocal => !useProduction;

  static String get environmentLabel => useProduction ? 'Production' : 'Local';

  /// The path the API serves stored media from.
  ///
  /// The database records a media URL as `/media/<key>`, which is the *public
  /// site's* path: the website rewrites `/media/*` to the API. The API itself
  /// serves the file from `/api/v1/media/<key>`, so the app has to point there
  /// instead of at the bare origin.
  static const String _mediaPath = '/api/v1/media';

  static String resolveMediaUrl(String? path) {
    if (path == null || path.isEmpty) return '';
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    final clean = path.startsWith('/') ? path : '/$path';

    // Already an API path (the app or a script stored an absolute one).
    if (clean.startsWith('/api/')) return '$apiOrigin$clean';

    // `/media/<key>` -> `/api/v1/media/<key>`
    final key = clean.startsWith('/media/')
        ? clean.substring('/media/'.length)
        : clean.startsWith('/')
        ? clean.substring(1)
        : clean;

    return '$apiOrigin$_mediaPath/$key';
  }

  static const Duration connectTimeout = Duration(seconds: 15);
  static const Duration receiveTimeout = Duration(seconds: 25);

  static const String appName = 'Virallink';
  static const String appVersion = '1.0.0';
}
