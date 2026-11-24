import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'common.dart';

class AsyncValueView<T> extends StatelessWidget {
  const AsyncValueView({
    super.key,
    required this.value,
    required this.builder,
    this.onRefresh,
    this.loadingLabel,
    this.compact = false,
  });

  final AsyncValue<T> value;
  final Widget Function(T data) builder;
  final Future<void> Function()? onRefresh;
  final String? loadingLabel;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return value.when(
      data: builder,
      loading: () => LoadingView(label: loadingLabel),
      error: (error, _) => ErrorState(
        message: messageForError(error),
        compact: compact,
        onRetry: onRefresh == null
            ? null
            : () {
                onRefresh!();
              },
      ),
    );
  }
}
