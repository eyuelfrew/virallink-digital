import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import 'data/inquiry_repository.dart';
import 'domain/inquiry.dart';

final inquiryRepositoryProvider = Provider<InquiryRepository>((ref) {
  return InquiryRepository(ref.watch(apiClientProvider));
});

final inquiryDetailProvider = FutureProvider.autoDispose.family<Inquiry, int>((
  ref,
  id,
) async {
  return ref.watch(inquiryRepositoryProvider).get(id);
});

final unreadInquiriesProvider = FutureProvider.autoDispose<List<Inquiry>>((
  ref,
) async {
  final page = await ref
      .watch(inquiryRepositoryProvider)
      .list(pageSize: 20, isRead: false, isArchived: false);
  return page.items;
});
