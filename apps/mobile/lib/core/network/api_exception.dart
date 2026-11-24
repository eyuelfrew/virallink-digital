import 'package:dio/dio.dart';

/// A single, typed error for every failed API call.
///
/// The API always answers failures with
/// `{ "error": { "code", "message", "details", "requestId" } }`.
/// Keeping that shape here means screens never have to dig through Dio
/// exceptions or raw maps.
class ApiException implements Exception {
  const ApiException({
    required this.message,
    this.statusCode = 0,
    this.code = 'UNKNOWN',
    this.fieldErrors = const {},
    this.requestId,
  });

  final int statusCode;
  final String code;
  final String message;
  final Map<String, List<String>> fieldErrors;
  final String? requestId;

  bool get isUnauthorized => statusCode == 401;
  bool get isForbidden => statusCode == 403;
  bool get isNetwork => statusCode == 0;
  bool get requiresPasswordChange => code == 'PASSWORD_CHANGE_REQUIRED';

  /// The first validation message for [field], if the server supplied one.
  String? fieldError(String field) {
    final messages = fieldErrors[field];
    return (messages == null || messages.isEmpty) ? null : messages.first;
  }

  factory ApiException.fromDio(DioException error) {
    final response = error.response;
    if (response == null) {
      return ApiException(
        message:
            error.type == DioExceptionType.connectionTimeout ||
                error.type == DioExceptionType.receiveTimeout ||
                error.type == DioExceptionType.sendTimeout
            ? 'The request timed out. Check your connection and try again.'
            : 'We could not reach the Virallink service. Check your connection and try again.',
        code: 'NETWORK_ERROR',
      );
    }

    final status = response.statusCode ?? 0;
    final payload = response.data;
    Map<String, dynamic>? envelope;

    if (payload is Map) {
      envelope = payload['error'] is Map
          ? Map<String, dynamic>.from(payload['error'] as Map)
          : null;
    }

    final details = <String, List<String>>{};
    final rawDetails = envelope?['details'];
    if (rawDetails is Map) {
      rawDetails.forEach((key, value) {
        if (value is List) {
          details['$key'] = value.map((item) => '$item').toList();
        } else if (value != null) {
          details['$key'] = ['$value'];
        }
      });
    }

    return ApiException(
      statusCode: status,
      code: (envelope?['code'] as String?) ?? _codeForStatus(status),
      message: (envelope?['message'] as String?) ?? _messageForStatus(status),
      fieldErrors: details,
      requestId: envelope?['requestId'] as String?,
    );
  }

  static String _codeForStatus(int status) {
    switch (status) {
      case 400:
        return 'BAD_REQUEST';
      case 401:
        return 'UNAUTHORIZED';
      case 403:
        return 'FORBIDDEN';
      case 404:
        return 'NOT_FOUND';
      case 409:
        return 'CONFLICT';
      case 413:
        return 'PAYLOAD_TOO_LARGE';
      case 422:
        return 'VALIDATION_ERROR';
      case 429:
        return 'RATE_LIMITED';
      default:
        return status >= 500 ? 'INTERNAL_ERROR' : 'UNKNOWN';
    }
  }

  static String _messageForStatus(int status) {
    switch (status) {
      case 401:
        return 'Your session has expired. Please sign in again.';
      case 403:
        return 'You do not have permission to do that.';
      case 404:
        return 'That item could not be found.';
      case 409:
        return 'That change conflicts with existing data.';
      case 422:
        return 'Some fields need attention.';
      case 429:
        return 'Too many requests. Please wait a moment and try again.';
      default:
        return status >= 500
            ? 'The service ran into a problem. Please try again.'
            : 'Something went wrong. Please try again.';
    }
  }

  @override
  String toString() => message;
}
