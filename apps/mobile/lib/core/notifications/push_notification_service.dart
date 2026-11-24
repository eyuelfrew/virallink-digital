/// The single seam for push delivery.
///
/// FCM/APNs is intentionally **not** wired in this build. When it is added,
/// implement this interface (Firebase Messaging, token registration, topic
/// subscriptions, foreground handlers) and swap the provider in
/// `core/providers.dart`. Screens already read their content from the API, so
/// no screen code needs to change.
abstract interface class PushNotificationService {
  Future<void> initialize();

  /// Sends the device token to the API when a registration endpoint exists.
  Future<void> registerDeviceToken(String token);

  Future<void> clearDeviceToken();
}

class NoopPushNotificationService implements PushNotificationService {
  const NoopPushNotificationService();

  @override
  Future<void> initialize() async {
    // No-op until FCM is enabled.
  }

  @override
  Future<void> registerDeviceToken(String token) async {
    // No-op until the API exposes a device registration endpoint.
  }

  @override
  Future<void> clearDeviceToken() async {
    // No-op until the API exposes a device registration endpoint.
  }
}
