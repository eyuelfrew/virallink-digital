import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../network/api_client.dart';
import '../storage/token_store.dart';
import 'push_notification_service.dart';

/// Top-level background handler. Must be a top-level function (not a closure)
/// so the OS can invoke it in a separate isolate.
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  // Background messages are displayed by the system tray automatically when
  // they carry a `notification` payload. Nothing else to do here.
}

/// Real FCM-backed implementation of [PushNotificationService].
///
/// Wired up by swapping the provider in `core/providers.dart`:
/// ```dart
/// final pushNotificationServiceProvider = Provider<PushNotificationService>((ref) {
///   return FcmPushNotificationService(
///     apiClient: ref.watch(apiClientProvider),
///     tokenStore: ref.watch(tokenStoreProvider),
///   );
/// });
/// ```
class FcmPushNotificationService implements PushNotificationService {
  FcmPushNotificationService({
    required ApiClient apiClient,
    required TokenStore tokenStore,
  })  : _api = apiClient,
        _tokens = tokenStore;

  final ApiClient _api;
  final TokenStore _tokens;

  final FlutterLocalNotificationsPlugin _local = FlutterLocalNotificationsPlugin();
  StreamSubscription<String>? _tokenSub;
  StreamSubscription<RemoteMessage>? _foregroundSub;

  @override
  Future<void> initialize() async {
    try {
      await Firebase.initializeApp();
    } catch (error) {
      // Firebase may already be initialized (e.g. from a previous isolate).
      debugPrint('Firebase init failed: $error');
      return;
    }

    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

    await _requestPermission();
    await _initLocalNotifications();
    await _registerCurrentToken();

    _tokenSub = FirebaseMessaging.instance.onTokenRefresh.listen((token) {
      registerDeviceToken(token);
    });

    _foregroundSub = FirebaseMessaging.onMessage.listen(_showForeground);
  }

  Future<void> _requestPermission() async {
    try {
      await FirebaseMessaging.instance.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );
    } catch (error) {
      debugPrint('Notification permission request failed: $error');
    }
  }

  Future<void> _initLocalNotifications() async {
    const android = AndroidInitializationSettings('@mipmap/ic_launcher');
    const ios = DarwinInitializationSettings();
    await _local.initialize(
      InitializationSettings(android: android, iOS: ios),
    );
  }

  Future<void> _registerCurrentToken() async {
    try {
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null) {
        await registerDeviceToken(token);
      }
    } catch (error) {
      debugPrint('FCM token fetch failed: $error');
    }
  }

  @override
  Future<void> registerDeviceToken(String token) async {
    if (!_tokens.hasSession) return;
    try {
      await _api.post(
        '/auth/push-tokens',
        body: {'token': token, 'platform': _platform()},
      );
    } catch (error) {
      debugPrint('Push token registration failed: $error');
    }
  }

  @override
  Future<void> clearDeviceToken() async {
    try {
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null && _tokens.hasSession) {
        await _api.delete('/auth/push-tokens', query: {'token': token});
      }
    } catch (error) {
      debugPrint('Push token removal failed: $error');
    }
    await _tokenSub?.cancel();
    await _foregroundSub?.cancel();
  }

  Future<void> _showForeground(RemoteMessage message) async {
    final notification = message.notification;
    if (notification == null) return;

    await _local.show(
      notification.hashCode,
      notification.title,
      notification.body,
      const NotificationDetails(
        android: AndroidNotificationDetails(
          'virallink_default',
          'Virallink',
          importance: Importance.high,
          priority: Priority.high,
        ),
        iOS: DarwinNotificationDetails(),
      ),
      payload: message.data.isEmpty ? null : message.data.toString(),
    );
  }

  String _platform() {
    // Best-effort platform detection without importing dart:io conditionally.
    return defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android';
  }
}
