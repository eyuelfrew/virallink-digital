import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import 'data/invoice_repository.dart';
import 'domain/invoice.dart';

final invoiceRepositoryProvider = Provider<InvoiceRepository>((ref) {
  return InvoiceRepository(ref.watch(apiClientProvider));
});

final invoiceDetailProvider = FutureProvider.autoDispose.family<Invoice, int>((
  ref,
  id,
) async {
  return ref.watch(invoiceRepositoryProvider).get(id);
});
