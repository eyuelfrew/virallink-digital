import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/config/app_config.dart';
import 'core/providers.dart';
import 'core/theme/app_theme.dart';
import 'features/auth/presentation/auth_controller.dart';
import 'features/auth/presentation/change_password_screen.dart';
import 'features/auth/presentation/login_screen.dart';
import 'features/auth/presentation/splash_screen.dart';
import 'features/shell/presentation/app_shell.dart';

/// Root widget. Authentication state decides which surface is shown, so there
/// is no manual navigation to keep in sync when a session expires or a
/// password change signs the device out.
class VirallinkApp extends ConsumerStatefulWidget {
  const VirallinkApp({super.key});

  @override
  ConsumerState<VirallinkApp> createState() => _VirallinkAppState();
}

class _VirallinkAppState extends ConsumerState<VirallinkApp> {
  final _navigatorKey = GlobalKey<NavigatorState>();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      // No-op until FCM is implemented; this is the only call site the app
      // needs when push is switched on.
      ref.read(pushNotificationServiceProvider).initialize();
    });
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);

    // A pushed detail screen must not stay on top when the session dies, so
    // clear the stack back to the root as soon as the account signs out.
    ref.listen<AuthState>(authControllerProvider, (previous, next) {
      final wasSignedIn = previous?.isAuthenticated ?? false;
      final signedOut =
          next.status == AuthStatus.unauthenticated ||
          next.status == AuthStatus.unreachable;
      if (wasSignedIn && signedOut) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          _navigatorKey.currentState?.popUntil((route) => route.isFirst);
        });
      }
    });

    return MaterialApp(
      title: AppConfig.appName,
      navigatorKey: _navigatorKey,
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      home: _homeFor(auth),
    );
  }

  Widget _homeFor(AuthState auth) {
    switch (auth.status) {
      case AuthStatus.bootstrapping:
        return const SplashScreen();
      case AuthStatus.unreachable:
        return ConnectionScreen(
          message: auth.message ?? 'The API did not respond.',
          onRetry: () =>
              ref.read(authControllerProvider.notifier).retryConnection(),
          onSignOut: () =>
              ref.read(authControllerProvider.notifier).abandonSession(),
        );
      case AuthStatus.unauthenticated:
        return const LoginScreen();
      case AuthStatus.authenticated:
        if (auth.user?.mustChangePassword ?? false) {
          return const ChangePasswordScreen(forced: true);
        }
        return const AppShell();
    }
  }
}
