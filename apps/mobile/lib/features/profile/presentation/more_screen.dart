import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/app_config.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/formatters.dart';
import '../../../shared/widgets/common.dart';
import '../../../shared/widgets/screen_header.dart';
import '../../../shared/widgets/status_pill.dart';
import '../../activity/presentation/activity_screen.dart';
import '../../chat/presentation/chat_list_screen.dart';
import '../../auth/presentation/change_password_screen.dart';
import '../../auth/presentation/change_handles_screen.dart';
import '../../telegram/presentation/telegram_account_screen.dart';
import '../../telegram/presentation/telegram_auto_reply_screen.dart';
import '../../notifications/presentation/notifications_inbox_screen.dart';
import '../../clients/presentation/clients_screen.dart';
import '../../inquiries/presentation/inquiries_screen.dart';
import '../../invoices/presentation/invoices_screen.dart';
import '../../tasks/presentation/all_tasks_screen.dart';

class MoreScreen extends ConsumerWidget {
  const MoreScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);

    return Column(
      children: [
        const ScreenHeader(
          title: 'More',
          subtitle: 'Account, modules and app information',
        ),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 28),
            children: [
              SurfaceCard(
                child: Row(
                  children: [
                    AppAvatar(name: user?.name, size: 52),
                    const SizedBox(width: 13),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            user?.name ?? 'Team member',
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w800,
                              letterSpacing: -0.2,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            user?.handle ?? '',
                            style: const TextStyle(
                              fontSize: 11.5,
                              color: AppColors.inkMuted,
                            ),
                          ),
                          const SizedBox(height: 7),
                          Wrap(
                            spacing: 5,
                            runSpacing: 5,
                            children: [
                              for (final role in (user?.roles ?? const []).take(
                                3,
                              ))
                                StatusPill(
                                  label: AppFormat.titleCase(role),
                                  tone: StatusTone.brand,
                                  compact: true,
                                ),
                              if ((user?.permissions.length ?? 0) > 0)
                                StatusPill(
                                  label:
                                      '${user!.permissions.length} permissions',
                                  tone: StatusTone.neutral,
                                  compact: true,
                                ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              if (user?.mustChangePassword ?? false)
                Padding(
                  padding: const EdgeInsets.only(top: 10),
                  child: SurfaceCard(
                    color: AppColors.warningSoft,
                    borderColor: AppColors.warning.withValues(alpha: 0.25),
                    child: const Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(
                          Icons.lock_reset_outlined,
                          size: 18,
                          color: AppColors.warning,
                        ),
                        SizedBox(width: 9),
                        Expanded(
                          child: Text(
                            'You are still using a temporary password. '
                            'Change it from the menu below.',
                            style: TextStyle(
                              fontSize: 12,
                              height: 1.4,
                              color: AppColors.warning,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              const SectionHeader(
                title: 'Modules',
                padding: EdgeInsets.fromLTRB(2, 18, 2, 8),
              ),
              SurfaceCard(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
                child: Column(
                  children: [
                    if (user?.can('task.read') ?? false)
                      _MenuTile(
                        icon: Icons.view_list_outlined,
                        label: 'All tasks',
                        description: 'Every task across the studio',
                        onTap: () => _push(context, const AllTasksScreen()),
                      ),
                    if (user?.can('client.read') ?? false)
                      _MenuTile(
                        icon: Icons.business_outlined,
                        label: 'Clients',
                        description: 'CRM, projects and balances',
                        onTap: () => _push(context, const ClientsScreen()),
                      ),
                    if (user?.can('finance.read') ?? false)
                      _MenuTile(
                        icon: Icons.receipt_long_outlined,
                        label: 'Invoices',
                        description: 'Issued, paid and outstanding',
                        onTap: () => _push(context, const InvoicesScreen()),
                      ),
                    if (user?.can('inquiry.read') ?? false)
                      _MenuTile(
                        icon: Icons.inbox_outlined,
                        label: 'Enquiries',
                        description: 'Contact-form pipeline',
                        onTap: () => _push(context, const InquiriesScreen()),
                      ),
                    if (user?.can('activity.read') ?? false)
                      _MenuTile(
                        icon: Icons.history,
                        label: 'Activity log',
                        description: 'Who changed what, and when',
                        onTap: () => _push(context, const ActivityScreen()),
                      ),
                    _MenuTile(
                      icon: Icons.chat_bubble_outline,
                      label: 'Chats',
                      description: 'Real-time private and group chat',
                      onTap: () => _push(context, const ChatListScreen()),
                    ),
                  ],
                ),
              ),
              const SectionHeader(
                title: 'Account',
                padding: EdgeInsets.fromLTRB(2, 18, 2, 8),
              ),
              SurfaceCard(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
                child: Column(
                  children: [
                    _MenuTile(
                      icon: Icons.send_outlined,
                      label: 'My Telegram',
                      description: 'Link your own Telegram account for auto-reply',
                      onTap: () => _push(context, const TelegramAccountScreen()),
                    ),
                    _MenuTile(
                      icon: Icons.smart_toy_outlined,
                      label: 'Auto-reply',
                      description: 'Settings, rules, images, audio and catalog',
                      onTap: () =>
                          _push(context, const TelegramAutoReplyScreen()),
                    ),
                    _MenuTile(
                      icon: Icons.alternate_email,
                      label: 'Sign-in handles',
                      description: 'Email, username or phone',
                      onTap: () => _push(context, const ChangeHandlesScreen()),
                    ),
                    _MenuTile(
                      icon: Icons.notifications_outlined,
                      label: 'Notifications',
                      description: 'Your notification inbox',
                      onTap: () => _push(context, const NotificationsInboxScreen()),
                    ),
                    _MenuTile(
                      icon: Icons.password_outlined,
                      label: 'Change password',
                      description: 'You will sign in again afterwards',
                      onTap: () => _push(context, const ChangePasswordScreen()),
                    ),
                    _MenuTile(
                      icon: Icons.send_outlined,
                      label: 'Telegram alerts',
                      description: _telegramDescription(user?.telegram.linked),
                      trailing: StatusPill(
                        label: user?.telegram.linked == true
                            ? 'Linked'
                            : 'Not linked',
                        tone: user?.telegram.linked == true
                            ? StatusTone.success
                            : StatusTone.neutral,
                        compact: true,
                      ),
                      onTap: null,
                    ),
                    _MenuTile(
                      icon: Icons.notifications_none_outlined,
                      label: 'Push notifications',
                      description: 'Send a test notification to this device',
                      trailing: const StatusPill(
                        label: 'Live',
                        tone: StatusTone.success,
                        compact: true,
                      ),
                      onTap: () async {
                        try {
                          final response = await ref
                              .read(apiClientProvider)
                              .post('/auth/push-test');
                          final data = response.asMap;
                          final sent = (data['sent'] as num?)?.toInt() ?? 0;
                          final failed =
                              (data['failed'] as num?)?.toInt() ?? 0;
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text(
                                  sent > 0
                                      ? 'Sent to $sent device${sent == 1 ? '' : 's'}.'
                                      : (failed > 0
                                          ? 'No device reached ($failed failed).'
                                          : 'Queued — no devices registered yet.'),
                                ),
                              ),
                            );
                          }
                        } catch (error) {
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text(
                                  'Could not send the test: $error',
                                ),
                              ),
                            );
                          }
                        }
                      },
                    ),
                  ],
                ),
              ),
              const SectionHeader(
                title: 'App',
                padding: EdgeInsets.fromLTRB(2, 18, 2, 8),
              ),
              SurfaceCard(
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 4,
                ),
                child: Column(
                  children: [
                    InfoRow(
                      label: 'Version',
                      value: '${AppConfig.appName} ${AppConfig.appVersion}',
                      icon: Icons.info_outline,
                    ),
                    if (user?.lastLoginAt != null) ...[
                      const Divider(height: 1),
                      InfoRow(
                        label: 'Last sign-in',
                        value: AppFormat.dateTime(user?.lastLoginAt),
                        icon: Icons.schedule,
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 18),
              OutlinedButton.icon(
                onPressed: () => _confirmSignOut(context, ref),
                icon: const Icon(Icons.logout, size: 18),
                label: const Text('Sign out'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.danger,
                  side: BorderSide(
                    color: AppColors.danger.withValues(alpha: 0.3),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  String _telegramDescription(bool? linked) {
    if (linked == true) {
      return 'Task alerts are delivered to your Telegram account';
    }
    return 'Link your account from the web admin to receive alerts';
  }

  Future<void> _push(BuildContext context, Widget screen) {
    return Navigator.of(
      context,
    ).push(MaterialPageRoute<void>(builder: (_) => screen));
  }

  Future<void> _confirmSignOut(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Sign out?'),
        content: const Text(
          'You will need your email and password to sign in again.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Sign out'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      await ref.read(authControllerProvider.notifier).logout();
    }
  }
}

class _MenuTile extends StatelessWidget {
  const _MenuTile({
    required this.icon,
    required this.label,
    required this.description,
    this.onTap,
    this.trailing,
  });

  final IconData icon;
  final String label;
  final String description;
  final VoidCallback? onTap;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 11),
        child: Row(
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                color: AppColors.brandSoft,
                borderRadius: BorderRadius.circular(9),
              ),
              child: Icon(icon, size: 17, color: AppColors.brand),
            ),
            const SizedBox(width: 11),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 1),
                  Text(
                    description,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 10.5,
                      height: 1.35,
                      color: AppColors.inkMuted,
                    ),
                  ),
                ],
              ),
            ),
            if (trailing != null) ...[const SizedBox(width: 8), trailing!],
            if (onTap != null) ...[
              const SizedBox(width: 4),
              const Icon(
                Icons.chevron_right,
                size: 17,
                color: AppColors.inkMuted,
              ),
            ],
          ],
        ),
      ),
    );
  }
}
