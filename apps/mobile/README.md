# Virallink Mobile

Flutter app for iOS and Android. It talks to the same Express API as the web
admin (`apps/api`) and mirrors the parts of the ERP that make sense on a phone:
today's dashboard, assigned tasks, alerts, clients, invoices, enquiries and the
activity log.

## Requirements

- Flutter 3.38+ / Dart 3.10+
- Xcode for iOS, Android Studio + SDK for Android
- The API running locally (`apps/api`) on port `4000`

## Push notifications (FCM)

Push notifications are wired up but need a Firebase project to function. The
app builds and runs without it — push simply stays disabled until configured.

### 1. Create a Firebase project
- Go to https://console.firebase.google.com → "Add project" → give it a name.
- Disable Google Analytics if you don't need it (optional).

### 2. Add an Android app
- Click "Add app" → Android.
- Package name: `com.virallink.virallink_mobile` (from `android/app/build.gradle.kts`).
- Download `google-services.json` and place it at `android/app/google-services.json`.
- The Gradle plugin is already configured to apply automatically when this file exists.

### 3. Add an iOS app (optional, for iOS builds)
- Click "Add app" → iOS.
- Bundle ID: check `ios/Runner.xcodeproj` → `PRODUCT_BUNDLE_IDENTIFIER`.
- Download `GoogleService-Info.plist` and place it at `ios/Runner/GoogleService-Info.plist`.

### 4. Get the service account key (for the API server)
- Firebase console → Project Settings → Service Accounts → "Generate new private key".
- Save the JSON file somewhere safe.
- On the API host (cPanel), set the environment variable `FIREBASE_SERVICE_ACCOUNT` to the **entire contents** of that JSON file (as a single line). Or set `FIREBASE_SERVICE_ACCOUNT_PATH` to the file path.

### 5. Rebuild
```sh
cd apps/mobile
flutter pub get
flutter build apk --release   # or flutter run for debug
```

### 6. Test
- Sign in on the phone → the FCM token registers automatically.
- In the app: More → "Push notifications" → tap "Send a test notification to this device".
- Or from the admin web: Notifications → send to a user.
- Or assign a task to a user → they get a push (and Telegram if configured).

Without Firebase configured, the app runs normally and push notifications are
silently disabled. The API exposes `POST /api/v1/auth/push-test` to send a test
notification to the signed-in user's devices once Firebase is configured.

## Run

```sh
cd apps/mobile
flutter pub get

# Android emulator or USB device: forward the API port first.
adb reverse tcp:4000 tcp:4000
flutter run

# iOS simulator (localhost is shared with the host).
flutter run
```

The app **does not** use `10.0.2.2`. Android reaches the host through
`adb reverse`, which also works on a physical device connected over USB. The
iOS simulator reaches `localhost` directly.

> A physical iPhone is a separate machine: `localhost` points at the phone.
> Use a LAN address or a tunnel and override the URL with
> `--dart-define=LOCAL_API_BASE_URL=http://<host>:4000/api/v1`.

## One switch: local vs production

`lib/core/config/app_config.dart` has a single boolean:

```dart
static const bool useProduction = bool.fromEnvironment(
  'USE_PRODUCTION',
  defaultValue: false,
);
```

- `false` → `http://localhost:4000/api/v1`
- `true` → the production URL

Override without editing source:

```sh
# Production build
flutter run --dart-define=USE_PRODUCTION=true \
  --dart-define=PRODUCTION_API_BASE_URL=https://api.example.com/api/v1

# Local build against another host/port
flutter run --dart-define=LOCAL_API_BASE_URL=http://localhost:4000/api/v1
```

Replace the `https://api.yourdomain.com` placeholder in `app_config.dart` (or
always pass `PRODUCTION_API_BASE_URL`) before shipping.

## Features

- **Auth** — email/password sign-in, first-run administrator setup, forced
  password change, secure token storage, automatic access-token refresh and
  request replay.
- **Dashboard** — counts, finance summary, revenue trend, status breakdown,
  recent activity, recent enquiries, deadlines and service mix. Users without
  `client.read` get a personal "My day" view instead.
- **Tasks** — my tasks with open/overdue/done filters, all-tasks search and
  pagination, task detail with status updates, priority, assignee, client and
  due dates.
- **Inbox** — unread enquiries, upcoming deadlines and open tasks in one list,
  plus a badge on the tab.
- **Clients** — searchable list, detail with contacts, projects, notes,
  communications, invoices and balance; tap-to-call/email/website.
- **Invoices** — list with status filters and totals, detail with line items
  and payment history.
- **Enquiries** — contact-form pipeline, detail view; opening an unread
  enquiry marks it read.
- **Activity log** — recent changes across the studio.
- **More** — profile, module shortcuts, environment/API info, password change
  and sign out.

Screens respect the permissions returned by `/auth/me`; unavailable modules are
hidden rather than shown as forbidden errors.

## Push notifications (deferred)

FCM/APNs is intentionally **not** wired in this build. The seam is:

- `lib/core/notifications/push_notification_service.dart` — the
  `PushNotificationService` interface plus a no-op implementation.
- `lib/core/providers.dart` — `pushNotificationServiceProvider`; swap the
  no-op for the Firebase implementation.
- `lib/app.dart` — calls `initialize()` once after the first frame.

To enable push later:

1. Add `firebase_core` and `firebase_messaging` (plus the platform config
   files).
2. Implement the interface: request permission, get the FCM token, handle
   foreground/background messages, and call `registerDeviceToken`.
3. Add a device-registration endpoint to the API and call it after sign-in;
   call `clearDeviceToken` on sign-out.
4. Swap the provider in `core/providers.dart`.

Until then, the Inbox is assembled from existing endpoints (unread enquiries,
deadlines, my tasks), so the alerts UI already has real content.

## Project layout

```
lib/
  app.dart                  auth-state routing
  main.dart                 ProviderScope entrypoint
  core/
    config/                 API switch and constants
    network/                Dio client, refresh/retry, envelopes, errors
    notifications/          push service seam (no-op)
    storage/                secure token/user storage
    theme/                  brand tokens and Material 3 theme
    utils/                  JSON readers and display formatters
  features/
    auth/ dashboard/ tasks/ inbox/ clients/ invoices/ enquiries/
    activity/ profile/ shell/
  shared/widgets/           cards, states, headers, pills, avatars
```

Each feature follows `data/` (repository), `domain/` (models), `presentation/`
(screens) and a `*_providers.dart` file for Riverpod wiring.

## Platform notes

- Android: `INTERNET` permission, label `Virallink`, and
  `android:usesCleartextTraffic="true"` for local HTTP. Remove cleartext (or
  scope it with a network-security config) once production HTTPS is in use.
- iOS: `NSAppTransportSecurity` allows insecure loads for `localhost` only.
  Remove that exception for a production-only build.
- Session tokens live in `flutter_secure_storage` (Keychain / Keystore).

## Checks

The app was validated statically (it is not started by the build pipeline):

```sh
flutter analyze
flutter test
```

`test/app_config_test.dart` asserts that the default build points at
`localhost:4000`, never `10.0.2.2`, and covers URL/media resolution plus the
shared formatters.
