import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../features/auth/data/auth_repository.dart';
import '../features/auth/domain/app_user.dart';
import '../features/auth/presentation/auth_controller.dart';
import '../features/telegram/data/telegram_account_repository.dart';
import '../features/telegram/data/telegram_auto_reply_repository.dart';
import 'network/api_client.dart';
import 'notifications/fcm_push_notification_service.dart';
import 'notifications/push_notification_service.dart';
import 'storage/token_store.dart';

final tokenStoreProvider = Provider<TokenStore>((ref) => TokenStore());

/// FCM-backed push delivery. Falls back gracefully when Firebase is not
/// configured (no google-services.json): initialize() catches the error and
/// the service stays a no-op.
final pushNotificationServiceProvider = Provider<PushNotificationService>((
  ref,
) {
  return FcmPushNotificationService(
    apiClient: ref.watch(apiClientProvider),
    tokenStore: ref.watch(tokenStoreProvider),
  );
});

final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(tokenStore: ref.watch(tokenStoreProvider));
});

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return AuthRepository(
    ref.watch(apiClientProvider),
    ref.watch(tokenStoreProvider),
  );
});

final telegramAccountRepositoryProvider = Provider<TelegramAccountRepository>((
  ref,
) {
  return TelegramAccountRepository(ref.watch(apiClientProvider));
});

/// Auto-reply management for the signed-in person's own connections.
final telegramAutoReplyRepositoryProvider =
    Provider<TelegramAutoReplyRepository>((ref) {
  return TelegramAutoReplyRepository(ref.watch(apiClientProvider));
});

final authControllerProvider = NotifierProvider<AuthController, AuthState>(
  AuthController.new,
);

/// The signed-in account, or null. Screens use this for permission checks.
final currentUserProvider = Provider<AppUser?>((ref) {
  return ref.watch(authControllerProvider).user;
});
