import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/chat/chat_providers.dart';
import '../../../core/theme/app_theme.dart';
import '../../dashboard/presentation/dashboard_screen.dart';
import '../../inbox/inbox_providers.dart';
import '../../inbox/presentation/inbox_screen.dart';
import '../../chat/presentation/chat_list_screen.dart';
import '../../profile/presentation/more_screen.dart';
import '../../tasks/presentation/my_tasks_screen.dart';

/// The signed-in home: four tabs sharing one bottom navigation bar.
///
/// Chat lives here now, with a badge for unread conversations. Screens keep
/// their own headers and pull-to-refresh, so the shell only owns navigation
/// state. An [IndexedStack] keeps scroll positions and avoids rebuilding a tab
/// each time it is selected.
class AppShell extends ConsumerStatefulWidget {
  const AppShell({super.key});

  @override
  ConsumerState<AppShell> createState() => _AppShellState();
}

class _AppShellState extends ConsumerState<AppShell> {
  int _index = 0;

  static const _destinations = [
    NavigationDestination(
      icon: Icon(Icons.dashboard_outlined),
      selectedIcon: Icon(Icons.dashboard),
      label: 'Dashboard',
    ),
    NavigationDestination(
      icon: Icon(Icons.checklist_outlined),
      selectedIcon: Icon(Icons.checklist),
      label: 'My tasks',
    ),
    NavigationDestination(
      icon: Icon(Icons.inbox_outlined),
      selectedIcon: Icon(Icons.inbox),
      label: 'Inbox',
    ),
  ];

  static const _moreDestination = NavigationDestination(
    icon: Icon(Icons.more_horiz),
    selectedIcon: Icon(Icons.more_horiz),
    label: 'More',
  );

  @override
  Widget build(BuildContext context) {
    final inboxUnread = ref.watch(inboxProvider).value?.unreadCount ?? 0;
    final chatUnread = ref
        .watch(chatListProvider)
        .fold<int>(0, (sum, conversation) => sum + conversation.unreadCount);

    return Scaffold(
      body: IndexedStack(
        index: _index,
        children: const [
          DashboardScreen(),
          MyTasksScreen(),
          InboxScreen(),
          ChatListScreen(),
          MoreScreen(),
        ],
      ),
      bottomNavigationBar: DecoratedBox(
        decoration: const BoxDecoration(
          border: Border(top: BorderSide(color: AppColors.line)),
        ),
        child: NavigationBar(
          selectedIndex: _index,
          onDestinationSelected: (value) => setState(() => _index = value),
          destinations: [
            _destinations[0],
            _destinations[1],
            NavigationDestination(
              icon: Badge.count(
                count: inboxUnread,
                isLabelVisible: inboxUnread > 0,
                child: const Icon(Icons.inbox_outlined),
              ),
              selectedIcon: Badge.count(
                count: inboxUnread,
                isLabelVisible: inboxUnread > 0,
                child: const Icon(Icons.inbox),
              ),
              label: 'Inbox',
            ),
            NavigationDestination(
              icon: Badge.count(
                count: chatUnread,
                isLabelVisible: chatUnread > 0,
                child: const Icon(Icons.chat_bubble_outline),
              ),
              selectedIcon: Badge.count(
                count: chatUnread,
                isLabelVisible: chatUnread > 0,
                child: const Icon(Icons.chat_bubble),
              ),
              label: 'Chats',
            ),
            _moreDestination,
          ],
        ),
      ),
    );
  }
}
