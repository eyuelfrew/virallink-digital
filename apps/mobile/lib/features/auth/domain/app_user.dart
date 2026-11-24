import '../../../core/utils/json.dart';

class TelegramLink {
  const TelegramLink({
    required this.configured,
    required this.linked,
    this.botUsername,
    this.username,
    this.alertsEnabled = true,
  });

  final bool configured;
  final bool linked;
  final String? botUsername;
  final String? username;
  final bool alertsEnabled;

  factory TelegramLink.fromJson(Map<String, dynamic> json) {
    return TelegramLink(
      configured: boolOr(json['configured']),
      linked: boolOr(json['linked']),
      botUsername: stringOrNull(json['botUsername']),
      username: stringOrNull(json['username']),
      alertsEnabled: boolOr(json['alertsEnabled'], true),
    );
  }

  Map<String, dynamic> toJson() => {
    'configured': configured,
    'linked': linked,
    'botUsername': botUsername,
    'username': username,
    'alertsEnabled': alertsEnabled,
  };
}

/// The signed-in account, exactly as `GET /api/v1/auth/me` and login return it.
class AppUser {
  const AppUser({
    required this.id,
    required this.name,
    this.email,
    this.username,
    this.phone,
    required this.isActive,
    required this.mustChangePassword,
    required this.roles,
    required this.permissions,
    this.employeeId,
    this.lastLoginAt,
    this.createdAt,
    this.telegram = const TelegramLink(configured: false, linked: false),
  });

  final int id;
  final String name;
  final String? email;
  final String? username;
  final String? phone;
  final bool isActive;
  final bool mustChangePassword;
  final int? employeeId;
  final List<String> roles;
  final List<String> permissions;
  final DateTime? lastLoginAt;
  final DateTime? createdAt;
  final TelegramLink telegram;

  /// The best available sign-in handle, for display in places that want a single
  /// label (the profile screen, the "signed in as" line). Falls back through
  /// email, username, phone so an account with no email still has something
  /// meaningful to show.
  String get handle => email ?? username ?? phone ?? '';

  bool can(String permission) => permissions.contains(permission);

  bool canAny(Iterable<String> wanted) =>
      wanted.any((permission) => permissions.contains(permission));

  String get primaryRole => roles.isEmpty ? 'Member' : roles.first;

  factory AppUser.fromJson(Map<String, dynamic> json) {
    return AppUser(
      id: intOr(json['id']),
      name: stringOr(json['name'], 'Team member'),
      email: stringOrNull(json['email']),
      username: stringOrNull(json['username']),
      phone: stringOrNull(json['phone']),
      isActive: boolOr(json['isActive'], true),
      mustChangePassword: boolOr(json['mustChangePassword']),
      employeeId: intOrNull(json['employeeId']),
      roles: stringsOr(json['roles']),
      permissions: stringsOr(json['permissions']),
      lastLoginAt: dateOrNull(json['lastLoginAt']),
      createdAt: dateOrNull(json['createdAt']),
      telegram: TelegramLink.fromJson(mapOr(json['telegram'])),
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'email': email,
    'username': username,
    'phone': phone,
    'isActive': isActive,
    'mustChangePassword': mustChangePassword,
    'employeeId': employeeId,
    'roles': roles,
    'permissions': permissions,
    'lastLoginAt': lastLoginAt?.toIso8601String(),
    'createdAt': createdAt?.toIso8601String(),
    'telegram': telegram.toJson(),
  };
}
