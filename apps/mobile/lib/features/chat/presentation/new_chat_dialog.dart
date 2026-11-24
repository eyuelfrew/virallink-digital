import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/domain/app_user.dart';
import '../../../core/chat/chat_providers.dart';
import '../../../core/chat/domain/conversation.dart';
import '../../../core/theme/app_theme.dart';
import './chat_avatar.dart';
import './new_group_dialog.dart';

/// Start a private chat: pick the person from the directory.
class NewChatDialog extends ConsumerWidget {
  const NewChatDialog({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final repository = ref.watch(chatRepositoryProvider);
    final users = ref.watch(newChatUsersProvider);

    return Dialog(
      child: SizedBox(
        width: 320,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 18, 20, 10),
              child: Row(
                children: [
                  Container(
                    width: 38,
                    height: 38,
                    decoration: const BoxDecoration(
                      gradient: LinearGradient(
                        colors: [AppColors.brand, AppColors.brandDark],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.add_comment_rounded,
                      color: Colors.white,
                      size: 18,
                    ),
                  ),
                  const SizedBox(width: 11),
                  const Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'New chat',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                          letterSpacing: -0.2,
                        ),
                      ),
                      Text(
                        'Pick someone to talk to',
                        style: TextStyle(
                          fontSize: 11.5,
                          color: AppColors.inkMuted,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            if (users.isLoading)
              const Center(
                child: Padding(
                  padding: EdgeInsets.symmetric(vertical: 30),
                  child: SizedBox(
                    width: 24,
                    height: 24,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                ),
              )
            else if (users.hasError)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
                child: Text(
                  'Could not load people. Try again later.',
                  style: TextStyle(color: AppColors.danger),
                ),
              )
            else
              Expanded(
                child: ListView.builder(
                  shrinkWrap: true,
                  itemCount: (users.value ?? const <AppUser>[])
                      .length,
                  itemBuilder: (context, index) {
                    final user = (users.value ?? const [])[index];
                    return ListTile(
                      leading: ChatAvatar(name: user.name, size: 40),
                      title: Text(user.name, style: const TextStyle(fontWeight: FontWeight.w600)),
                      subtitle: user.handle.isEmpty
                          ? null
                          : Text(user.handle, style: TextStyle(color: AppColors.inkMuted)),
                      onTap: () async {
                        final conversation =
                            await repository.createPrivateChat(
                              userId: user.id,
                            );
                        if (!context.mounted) return;
                        Navigator.of(context).pop(conversation);
                      },
                    );
                  },
                ),
              ),
            if (users.hasValue && (users.value ?? const []).isEmpty && !users.isLoading)
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                child: Text(
                  'No people to chat with yet.',
                  style: TextStyle(color: AppColors.inkMuted),
                ),
              ),
            const Divider(height: 1),
            ListTile(
              leading: Container(
                width: 40,
                height: 40,
                decoration: const BoxDecoration(
                  color: AppColors.brandSoft,
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.group_add_outlined,
                  color: AppColors.brand,
                  size: 20,
                ),
              ),
              title: const Text(
                'New group',
                style: TextStyle(fontWeight: FontWeight.w600),
              ),
              subtitle: const Text('Chat with more than one person'),
              onTap: () async {
                final group = await showDialog<Conversation>(
                  context: context,
                  builder: (_) => const NewGroupDialog(),
                );
                if (!context.mounted || group == null) return;
                Navigator.of(context).pop(group);
              },
            ),
          ],
        ),
      ),
    );
  }
}
