import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/providers.dart';
import '../data/auth_repository.dart';
import '../domain/app_user.dart';

enum AuthStatus { bootstrapping, authenticated, unauthenticated, unreachable }

class AuthState {
  const AuthState({required this.status, this.user, this.message});

  final AuthStatus status;
  final AppUser? user;
  final String? message;

  bool get isAuthenticated =>
      status == AuthStatus.authenticated && user != null;

  AuthState copyWith({
    AuthStatus? status,
    AppUser? user,
    String? message,
    bool clearMessage = false,
  }) {
    return AuthState(
      status: status ?? this.status,
      user: user ?? this.user,
      message: clearMessage ? null : (message ?? this.message),
    );
  }
}

class AuthController extends Notifier<AuthState> {
  @override
  AuthState build() {
    final api = ref.watch(apiClientProvider);
    api.onSessionExpired = _handleExpiredSession;

    Future<void>.microtask(bootstrap);

    return const AuthState(status: AuthStatus.bootstrapping);
  }

  AuthRepository get _repository => ref.read(authRepositoryProvider);

  Future<void> bootstrap() async {
    final tokens = ref.read(tokenStoreProvider);
    await tokens.load();

    if (!tokens.hasSession) {
      state = const AuthState(status: AuthStatus.unauthenticated);
      return;
    }

    state = const AuthState(status: AuthStatus.bootstrapping);

    try {
      final user = await _repository.me();
      state = AuthState(status: AuthStatus.authenticated, user: user);

      // Best-effort push setup for a restored session.
      try {
        await ref.read(pushNotificationServiceProvider).initialize();
      } catch (_) {
        // Push is optional.
      }
    } on ApiException catch (error) {
      if (error.isUnauthorized || error.isForbidden) {
        await tokens.clear();
        state = AuthState(
          status: AuthStatus.unauthenticated,
          message: error.isForbidden ? error.message : null,
        );
        return;
      }

      if (error.isNetwork) {
        state = AuthState(
          status: AuthStatus.unreachable,
          message: error.message,
        );
        return;
      }

      state = AuthState(status: AuthStatus.unreachable, message: error.message);
    }
  }

  Future<AppUser> login({
    required String identifier,
    required String password,
  }) async {
    final user = await _repository.login(identifier: identifier, password: password);
    state = AuthState(status: AuthStatus.authenticated, user: user);

    // Best-effort push setup. Never blocks sign-in.
    try {
      await ref.read(pushNotificationServiceProvider).initialize();
    } catch (_) {
      // Push is optional; a failure here must not break sign-in.
    }

    return user;
  }

  Future<void> logout() async {
    try {
      await ref.read(pushNotificationServiceProvider).clearDeviceToken();
    } catch (_) {
      // Best-effort.
    }
    await _repository.logout();
    state = const AuthState(status: AuthStatus.unauthenticated);
  }

  Future<void> retryConnection() async {
    state = const AuthState(status: AuthStatus.bootstrapping);
    await bootstrap();
  }

  Future<void> refreshProfile() async {
    try {
      final user = await _repository.me();
      state = AuthState(status: AuthStatus.authenticated, user: user);
    } catch (_) {
      // Keep the current session; the next request will surface the error.
    }
  }

  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    await _repository.changePassword(
      currentPassword: currentPassword,
      newPassword: newPassword,
    );
    state = const AuthState(
      status: AuthStatus.unauthenticated,
      message: 'Password updated. Sign in with your new password.',
    );
  }

  Future<void> changeHandles({
    required String currentPassword,
    required String? email,
    required String? username,
    required String? phone,
  }) async {
    await _repository.changeHandles(
      currentPassword: currentPassword,
      email: email,
      username: username,
      phone: phone,
    );
    // Refresh the signed-in profile so the new handles are reflected locally.
    await refreshProfile();
  }

  Future<void> abandonSession() async {
    await _repository.signOutLocally();
    state = const AuthState(status: AuthStatus.unauthenticated);
  }

  void _handleExpiredSession() {
    if (state.status == AuthStatus.authenticated) {
      state = const AuthState(
        status: AuthStatus.unauthenticated,
        message: 'Your session expired. Please sign in again.',
      );
    }
  }
}
