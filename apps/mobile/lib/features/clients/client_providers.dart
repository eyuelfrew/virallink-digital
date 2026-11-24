import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import 'data/client_repository.dart';
import 'domain/client.dart';

final clientRepositoryProvider = Provider<ClientRepository>((ref) {
  return ClientRepository(ref.watch(apiClientProvider));
});

final clientDetailProvider = FutureProvider.autoDispose.family<Client, int>((
  ref,
  id,
) async {
  return ref.watch(clientRepositoryProvider).get(id);
});
