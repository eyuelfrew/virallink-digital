import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/domain/app_user.dart';
import '../../../core/chat/chat_providers.dart';
import '../../../core/theme/app_theme.dart';
import './chat_avatar.dart';

/// Create a group: a name plus its members. The creator is added by the API.
class NewGroupDialog extends ConsumerStatefulWidget {
  const NewGroupDialog({super.key});

  @override
  ConsumerState<NewGroupDialog> createState() => _NewGroupDialogState();
}

class _NewGroupDialogState extends ConsumerState<NewGroupDialog> {
  final _titleController = TextEditingController();
  final _selected = <int>{};
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    // The Create button depends on the name as well as the member list, so
    // rebuild while the name is typed — not only when a member is toggled.
    _titleController.addListener(_onTitleChanged);
  }

  void _onTitleChanged() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _titleController.removeListener(_onTitleChanged);
    _titleController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final users = ref.watch(newChatUsersProvider);
    final allUsers = users.value ?? const <AppUser>[];
    final canCreate = !_sending && _selected.isNotEmpty && _titleController.text.trim().isNotEmpty;

    return AlertDialog(
      title: const Text('New group'),
      content: SizedBox(
        width: 320,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
              child: TextField(
                controller: _titleController,
                autofocus: true,
                decoration: const InputDecoration(
                  labelText: 'Group name',
                  hintText: 'Engineering standup',
                ),
              ),
            ),
            const SizedBox(height: 8),
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
            else if (allUsers.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 20, horizontal: 4),
                child: Text('No people to add yet.', style: TextStyle(color: AppColors.inkMuted)),
              )
            else
              ConstrainedBox(
                constraints: const BoxConstraints(maxHeight: 220),
                child: ListView.builder(
                  shrinkWrap: true,
                  itemCount: allUsers.length,
                  itemBuilder: (context, index) {
                    final user = allUsers[index];
                    final isSelected = _selected.contains(user.id);
                    return ListTile(
                      leading: ChatAvatar(name: user.name, size: 36),
                      title: Text(
                        user.name,
                        style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                      ),
                      trailing: Icon(
                        isSelected ? Icons.check_box : Icons.check_box_outline_blank,
                        color: AppColors.brand,
                        size: 22,
                      ),
                      onTap: () {
                        if (_selected.contains(user.id)) {
                          _selected.remove(user.id);
                        } else {
                          _selected.add(user.id);
                        }
                        setState(() {});
                      },
                    );
                  },
                ),
              ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
        FilledButton(
          onPressed: canCreate ? _create : null,
          child: _sending
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('Create'),
        ),
      ],
    );
  }

  Future<void> _create() async {
    setState(() => _sending = true);
    try {
      final conversation = await ref.read(chatRepositoryProvider).createGroupChat(
        title: _titleController.text.trim(),
        memberIds: _selected.toList(),
      );
      if (!mounted) return;
      Navigator.of(context).pop(conversation);
    } catch (error) {
      if (!mounted) return;
      setState(() => _sending = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not create the group: $error')),
      );
    }
  }
}
