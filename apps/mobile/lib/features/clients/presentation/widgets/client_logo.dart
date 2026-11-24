import 'package:flutter/material.dart';

import '../../../../shared/widgets/common.dart';
import '../../domain/client.dart';

class ClientLogo extends StatelessWidget {
  const ClientLogo({super.key, required this.client, this.size = 42});

  final Client client;
  final double size;

  @override
  Widget build(BuildContext context) {
    final url = client.logoUrl;
    if (url == null || url.isEmpty) {
      return AppAvatar(name: client.name, size: size);
    }

    return ClipRRect(
      borderRadius: BorderRadius.circular(size * 0.28),
      child: Image.network(
        url,
        width: size,
        height: size,
        fit: BoxFit.cover,
        errorBuilder: (_, _, _) => AppAvatar(name: client.name, size: size),
      ),
    );
  }
}
