import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Firebase is optional at build time: without google-services.json the init
  // throws and the app keeps running with push notifications disabled. The
  // FcmPushNotificationService handles the failure gracefully.
  try {
    await Firebase.initializeApp();
  } catch (_) {
    // No Firebase configuration shipped with this build.
  }

  runApp(const ProviderScope(child: VirallinkApp()));
}
