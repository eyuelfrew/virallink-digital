import '../../../core/utils/json.dart';

/// Status of the signed-in person's own Telegram account (MTProto link).
class TelegramAccountStatus {
  const TelegramAccountStatus({
    this.apiId,
    this.apiHashSet = false,
    this.phoneNumber = '',
    this.configured = false,
    this.connected = false,
    this.sessionSet = false,
    this.source = 'none',
    this.status = 'disconnected',
    this.lastError,
    this.lastConnectedAt,
    this.autoReplyAccountId,
    this.account,
    this.pendingLogin,
  });

  final int? apiId;
  final bool apiHashSet;
  final String phoneNumber;
  final bool configured;
  final bool connected;
  final bool sessionSet;
  final String source;
  final String status;
  final String? lastError;
  final DateTime? lastConnectedAt;
  final int? autoReplyAccountId;
  final TelegramAccount? account;
  final TelegramPendingLogin? pendingLogin;

  bool get codeSent => pendingLogin?.status == 'code_sent';
  bool get passwordRequired => pendingLogin?.status == 'password_required';

  factory TelegramAccountStatus.fromJson(Map<String, dynamic> json) {
    return TelegramAccountStatus(
      apiId: intOrNull(json['apiId']),
      apiHashSet: boolOr(json['apiHashSet']),
      phoneNumber: stringOr(json['phoneNumber']),
      configured: boolOr(json['configured']),
      connected: boolOr(json['connected']),
      sessionSet: boolOr(json['sessionSet']),
      source: stringOr(json['source'], 'none'),
      status: stringOr(json['status'], 'disconnected'),
      lastError: stringOrNull(json['lastError']),
      lastConnectedAt: dateOrNull(json['lastConnectedAt']),
      autoReplyAccountId: intOrNull(json['autoReplyAccountId']),
      account: json['account'] is Map
          ? TelegramAccount.fromJson(mapOr(json['account']))
          : null,
      pendingLogin: json['pending_login'] is Map
          ? TelegramPendingLogin.fromJson(mapOr(json['pending_login']))
          : null,
    );
  }
}

class TelegramAccount {
  const TelegramAccount({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.username,
  });

  final String id;
  final String firstName;
  final String lastName;
  final String username;

  String get displayName {
    final full = [firstName, lastName].where((part) => part.isNotEmpty).join(' ');
    return full.isNotEmpty ? full : username;
  }

  factory TelegramAccount.fromJson(Map<String, dynamic> json) {
    return TelegramAccount(
      id: stringOr(json['id']),
      firstName: stringOr(json['first_name']),
      lastName: stringOr(json['last_name']),
      username: stringOr(json['username']),
    );
  }
}

class TelegramPendingLogin {
  const TelegramPendingLogin({this.status});

  final String? status;

  factory TelegramPendingLogin.fromJson(Map<String, dynamic> json) {
    return TelegramPendingLogin(status: stringOrNull(json['status']));
  }
}
