import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import '../domain/telegram_account_status.dart';

class TelegramAccountScreen extends ConsumerStatefulWidget {
  const TelegramAccountScreen({super.key});

  @override
  ConsumerState<TelegramAccountScreen> createState() =>
      _TelegramAccountScreenState();
}

class _TelegramAccountScreenState extends ConsumerState<TelegramAccountScreen> {
  final _apiIdController = TextEditingController();
  final _apiHashController = TextEditingController();
  final _phoneController = TextEditingController();
  final _codeController = TextEditingController();
  final _passwordController = TextEditingController();

  bool _loading = true;
  bool _busy = false;
  String? _error;
  String? _notice;
  TelegramAccountStatus? _status;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _apiIdController.dispose();
    _apiHashController.dispose();
    _phoneController.dispose();
    _codeController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final status =
          await ref.read(telegramAccountRepositoryProvider).status();
      if (!mounted) return;
      setState(() {
        _status = status;
        _apiIdController.text = status.apiId?.toString() ?? '';
        _phoneController.text = status.phoneNumber;
        _loading = false;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.message;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Could not load your Telegram account.';
        _loading = false;
      });
    }
  }

  Future<void> _run(Future<TelegramAccountStatus> Function() action,
      {String? successMessage}) async {
    setState(() {
      _busy = true;
      _error = null;
      _notice = null;
    });
    try {
      final status = await action();
      if (!mounted) return;
      setState(() {
        _status = status;
        _notice = successMessage;
        _busy = false;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.message;
        _busy = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Something went wrong. Please try again.';
        _busy = false;
      });
    }
  }

  Future<bool> _confirm(String message, {String confirmLabel = 'Confirm'}) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Are you sure?'),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(confirmLabel),
          ),
        ],
      ),
    );
    return ok ?? false;
  }

  @override
  Widget build(BuildContext context) {
    final status = _status;
    final connected = status?.connected ?? false;

    return Scaffold(
      appBar: AppBar(
        title: const Text('My Telegram'),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: _busy ? null : _load,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : RefreshIndicator(
                onRefresh: _load,
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _StatusHeader(connected: connected, status: status),
                      const SizedBox(height: 18),
                      if (_error != null) ...[
                        _Banner(
                          message: _error!,
                          color: AppColors.danger,
                          background: AppColors.dangerSoft,
                          icon: Icons.error_outline,
                        ),
                        const SizedBox(height: 14),
                      ],
                      if (_notice != null) ...[
                        _Banner(
                          message: _notice!,
                          color: AppColors.success,
                          background: AppColors.successSoft,
                          icon: Icons.check_circle_outline,
                        ),
                        const SizedBox(height: 14),
                      ],
                      if (status?.lastError != null && !connected) ...[
                        _Banner(
                          message: status!.lastError!,
                          color: AppColors.warning,
                          background: AppColors.warningSoft,
                          icon: Icons.warning_amber_outlined,
                        ),
                        const SizedBox(height: 14),
                      ],
                      if (connected) ...[
                        _ConnectedCard(
                          status: status,
                          busy: _busy,
                          onConnect: () => _run(
                            () => ref
                                .read(telegramAccountRepositoryProvider)
                                .connect(),
                            successMessage: 'Connected.',
                          ),
                          onDisconnect: () => _confirmAndRun(
                            'Disconnect this account? Auto-reply stops until you reconnect.',
                            () => ref
                                .read(telegramAccountRepositoryProvider)
                                .disconnect(),
                            'Disconnected.',
                          ),
                          onClearSession: () => _confirmAndRun(
                            'Forget the saved session? You will need a fresh login code.',
                            () => ref
                                .read(telegramAccountRepositoryProvider)
                                .clearSession(),
                            'Saved session cleared.',
                          ),
                          onReset: () => _confirmAndRun(
                            'Reset your Telegram setup? Credentials and session are removed; your rules and catalog are kept.',
                            () => ref
                                .read(telegramAccountRepositoryProvider)
                                .resetConfig(),
                            'Telegram setup reset.',
                          ),
                        ),
                      ] else if (status?.codeSent ?? false) ...[
                        _CodeCard(
                          controller: _codeController,
                          busy: _busy,
                          onSubmit: () => _run(
                            () => ref
                                .read(telegramAccountRepositoryProvider)
                                .verifyCode(_codeController.text),
                            successMessage: 'Code verified.',
                          ),
                          onCancel: () => _run(
                            () => ref
                                .read(telegramAccountRepositoryProvider)
                                .cancelLogin(),
                            successMessage: 'Sign-in cancelled.',
                          ),
                        ),
                      ] else if (status?.passwordRequired ?? false) ...[
                        _PasswordCard(
                          controller: _passwordController,
                          busy: _busy,
                          onSubmit: () => _run(
                            () => ref
                                .read(telegramAccountRepositoryProvider)
                                .verifyPassword(_passwordController.text),
                            successMessage: 'Connected.',
                          ),
                          onCancel: () => _run(
                            () => ref
                                .read(telegramAccountRepositoryProvider)
                                .cancelLogin(),
                            successMessage: 'Sign-in cancelled.',
                          ),
                        ),
                      ] else ...[
                        _CredentialsCard(
                          apiIdController: _apiIdController,
                          apiHashController: _apiHashController,
                          phoneController: _phoneController,
                          configured: status?.configured ?? false,
                          apiHashSet: status?.apiHashSet ?? false,
                          busy: _busy,
                          onSave: () => _run(
                            () => ref
                                .read(telegramAccountRepositoryProvider)
                                .saveConfig(
                                  apiId: int.tryParse(
                                          _apiIdController.text.trim()) ??
                                      0,
                                  apiHash: _apiHashController.text,
                                  phoneNumber: _phoneController.text,
                                ),
                            successMessage: 'Credentials saved.',
                          ),
                          onSendCode: () => _run(
                            () => ref
                                .read(telegramAccountRepositoryProvider)
                                .sendCode(),
                            successMessage:
                                'Telegram sent a login code. Check your Telegram app or SMS.',
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
      ),
    );
  }

  Future<void> _confirmAndRun(
    String message,
    Future<TelegramAccountStatus> Function() action,
    String successMessage,
  ) async {
    final ok = await _confirm(message);
    if (!ok) return;
    await _run(action, successMessage: successMessage);
  }
}

class _StatusHeader extends StatelessWidget {
  const _StatusHeader({required this.connected, this.status});

  final bool connected;
  final TelegramAccountStatus? status;

  @override
  Widget build(BuildContext context) {
    final name = status?.account?.displayName;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: connected ? AppColors.successSoft : AppColors.surface,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          Icon(
            connected ? Icons.link_rounded : Icons.link_off_rounded,
            color: connected ? AppColors.success : AppColors.inkMuted,
            size: 28,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  connected ? 'Telegram connected' : 'Telegram not connected',
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  name?.isNotEmpty == true
                      ? 'Auto-reply is answering chats to $name'
                      : 'Sign in with your own Telegram account',
                  style: TextStyle(
                    fontSize: 12,
                    color: AppColors.inkMuted.withValues(alpha: 0.95),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Banner extends StatelessWidget {
  const _Banner({
    required this.message,
    required this.color,
    required this.background,
    required this.icon,
  });

  final String message;
  final Color color;
  final Color background;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: color),
          const SizedBox(width: 9),
          Expanded(
            child: Text(
              message,
              style: TextStyle(
                fontSize: 12.5,
                height: 1.4,
                color: color,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CredentialsCard extends StatelessWidget {
  const _CredentialsCard({
    required this.apiIdController,
    required this.apiHashController,
    required this.phoneController,
    required this.configured,
    required this.apiHashSet,
    required this.busy,
    required this.onSave,
    required this.onSendCode,
  });

  final TextEditingController apiIdController;
  final TextEditingController apiHashController;
  final TextEditingController phoneController;
  final bool configured;
  final bool apiHashSet;
  final bool busy;
  final VoidCallback onSave;
  final VoidCallback onSendCode;

  @override
  Widget build(BuildContext context) {
    return _Card(
      title: configured ? 'Credentials saved' : 'Sign in with Telegram',
      subtitle: configured
          ? 'Your apiId, hash and phone are saved. Send yourself a login code next.'
          : 'Enter the apiId and apiHash from my.telegram.org and your phone number.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            controller: apiIdController,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(labelText: 'apiId'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: apiHashController,
            obscureText: true,
            decoration: InputDecoration(
              labelText: 'apiHash',
              helperText:
                  apiHashSet ? 'Already saved. Leave blank to keep it.' : null,
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: phoneController,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(
              labelText: 'Phone number',
              hintText: '+251 9xx xxx xxx',
            ),
          ),
          const SizedBox(height: 18),
          FilledButton(
            onPressed: busy ? null : onSave,
            child: Text(configured ? 'Update credentials' : 'Save credentials'),
          ),
          const SizedBox(height: 8),
          OutlinedButton(
            onPressed: busy ? null : onSendCode,
            child: const Text('Send login code'),
          ),
        ],
      ),
    );
  }
}

class _CodeCard extends StatelessWidget {
  const _CodeCard({
    required this.controller,
    required this.busy,
    required this.onSubmit,
    required this.onCancel,
  });

  final TextEditingController controller;
  final bool busy;
  final VoidCallback onSubmit;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    return _Card(
      title: 'Enter login code',
      subtitle:
          'Telegram sent a code to your Telegram app or by SMS. Enter it below.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            controller: controller,
            keyboardType: TextInputType.number,
            autofocus: true,
            decoration: const InputDecoration(labelText: 'Code'),
            onSubmitted: (_) => busy ? null : onSubmit(),
          ),
          const SizedBox(height: 18),
          FilledButton(
            onPressed: busy ? null : onSubmit,
            child: const Text('Verify code'),
          ),
          const SizedBox(height: 8),
          TextButton(
            onPressed: busy ? null : onCancel,
            child: const Text('Cancel sign-in'),
          ),
        ],
      ),
    );
  }
}

class _PasswordCard extends StatelessWidget {
  const _PasswordCard({
    required this.controller,
    required this.busy,
    required this.onSubmit,
    required this.onCancel,
  });

  final TextEditingController controller;
  final bool busy;
  final VoidCallback onSubmit;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    return _Card(
      title: 'Two-factor password',
      subtitle:
          'This Telegram account has two-factor authentication enabled. Enter your password.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            controller: controller,
            obscureText: true,
            autofocus: true,
            decoration: const InputDecoration(labelText: 'Password'),
            onSubmitted: (_) => busy ? null : onSubmit(),
          ),
          const SizedBox(height: 18),
          FilledButton(
            onPressed: busy ? null : onSubmit,
            child: const Text('Verify password'),
          ),
          const SizedBox(height: 8),
          TextButton(
            onPressed: busy ? null : onCancel,
            child: const Text('Cancel sign-in'),
          ),
        ],
      ),
    );
  }
}

class _ConnectedCard extends StatelessWidget {
  const _ConnectedCard({
    required this.status,
    required this.busy,
    required this.onConnect,
    required this.onDisconnect,
    required this.onClearSession,
    required this.onReset,
  });

  final TelegramAccountStatus? status;
  final bool busy;
  final VoidCallback onConnect;
  final VoidCallback onDisconnect;
  final VoidCallback onClearSession;
  final VoidCallback onReset;

  @override
  Widget build(BuildContext context) {
    final name = status?.account?.displayName;
    return _Card(
      title: name?.isNotEmpty == true ? 'Signed in as $name' : 'Signed in',
      subtitle: status?.lastConnectedAt != null
          ? 'Last connected: ${_formatDate(status!.lastConnectedAt!)}'
          : 'Your account is ready to answer chats.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          OutlinedButton.icon(
            onPressed: busy ? null : onDisconnect,
            icon: const Icon(Icons.link_off),
            label: const Text('Disconnect'),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: busy ? null : onClearSession,
            icon: const Icon(Icons.delete_outline),
            label: const Text('Clear saved session'),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: busy ? null : onReset,
            icon: const Icon(Icons.restart_alt),
            label: const Text('Reset Telegram setup'),
            style: OutlinedButton.styleFrom(foregroundColor: AppColors.danger),
          ),
        ],
      ),
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({
    required this.title,
    required this.subtitle,
    required this.child,
  });

  final String title;
  final String subtitle;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            title,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 4),
          Text(
            subtitle,
            style: const TextStyle(
              fontSize: 12.5,
              height: 1.4,
              color: AppColors.inkMuted,
            ),
          ),
          const SizedBox(height: 16),
          child,
        ],
      ),
    );
  }
}

String _formatDate(DateTime value) {
  final local = value.toLocal();
  final now = DateTime.now();
  final diff = now.difference(local);
  if (diff.inMinutes < 1) return 'just now';
  if (diff.inHours < 1) return '${diff.inMinutes}m ago';
  if (diff.inDays < 1) return '${diff.inHours}h ago';
  return '${local.day}/${local.month}/${local.year}';
}
