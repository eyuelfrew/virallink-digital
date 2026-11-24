/// A parsed API response envelope: `{ data, meta?, totals? }`.
class ApiResponse {
  const ApiResponse({required this.data, this.meta, this.totals});

  final dynamic data;
  final Map<String, dynamic>? meta;
  final Map<String, dynamic>? totals;

  Map<String, dynamic> get asMap {
    if (data is Map<String, dynamic>) return data as Map<String, dynamic>;
    if (data is Map) return Map<String, dynamic>.from(data as Map);
    return const {};
  }

  List<dynamic> get asList => data is List ? data as List : const [];

  int get total => _int(meta?['total']);
  int get page => _int(meta?['page'], fallback: 1);
  int get pageSize => _int(meta?['pageSize'], fallback: 20);
  int get totalPages => _int(meta?['totalPages'], fallback: 1);
  bool get hasNext => page < totalPages;

  static int _int(dynamic value, {int fallback = 0}) {
    if (value is int) return value;
    if (value is num) return value.toInt();
    return int.tryParse('${value ?? ''}') ?? fallback;
  }
}

/// A paginated list plus its metadata.
class ApiPage<T> {
  const ApiPage({
    required this.items,
    required this.page,
    required this.pageSize,
    required this.total,
    required this.totalPages,
  });

  final List<T> items;
  final int page;
  final int pageSize;
  final int total;
  final int totalPages;

  bool get hasNext => page < totalPages;
  bool get isEmpty => items.isEmpty;

  factory ApiPage.fromResponse(
    ApiResponse response,
    T Function(Map<String, dynamic>) parse,
  ) {
    final items = response.asList
        .whereType<Map>()
        .map((item) => parse(Map<String, dynamic>.from(item)))
        .toList(growable: false);

    return ApiPage(
      items: items,
      page: response.page,
      pageSize: response.pageSize,
      total: response.total,
      totalPages: response.totalPages,
    );
  }

  ApiPage<T> append(ApiPage<T> next) {
    return ApiPage(
      items: [...items, ...next.items],
      page: next.page,
      pageSize: next.pageSize,
      total: next.total,
      totalPages: next.totalPages,
    );
  }
}
