import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/providers.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/common.dart';
import '../../../shared/widgets/status_pill.dart';
import 'auth_controller.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _identifierController = TextEditingController();
  final _passwordController = TextEditingController();

  bool _obscurePassword = true;
  bool _submitting = false;
  bool _checkingSetup = true;
  bool _needsSetup = false;
  String? _error;
  Map<String, List<String>> _fieldErrors = const {};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _checkSetup());
  }

  @override
  void dispose() {
    _nameController.dispose();
    _identifierController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _checkSetup() async {
    try {
      final needsSetup = await ref.read(authRepositoryProvider).needsSetup();
      if (mounted) setState(() => _needsSetup = needsSetup);
    } catch (_) {
      // An unreachable API will surface on submit with a clear message.
    } finally {
      if (mounted) setState(() => _checkingSetup = false);
    }
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    if (!(_formKey.currentState?.validate() ?? false)) return;

    setState(() {
      _submitting = true;
      _error = null;
      _fieldErrors = const {};
    });

    try {
      if (_needsSetup) {
        await ref
            .read(authRepositoryProvider)
            .setup(
              name: _nameController.text.trim(),
              identifier: _identifierController.text.trim(),
              password: _passwordController.text,
            );

        if (!mounted) return;
        setState(() {
          _needsSetup = false;
          _passwordController.clear();
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Administrator created. Sign in to continue.'),
          ),
        );
        return;
      }

      await ref
          .read(authControllerProvider.notifier)
          .login(
            identifier: _identifierController.text.trim(),
            password: _passwordController.text,
          );
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.message;
        _fieldErrors = error.fieldErrors;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Something went wrong. Please try again.';
      });
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authControllerProvider);
    final infoMessage = authState.status == AuthStatus.unauthenticated
        ? authState.message
        : null;

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(22, 28, 22, 24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const _LoginHeader(),
                  const SizedBox(height: 26),
                  if (infoMessage != null) ...[
                    _Banner(
                      message: infoMessage,
                      tone: StatusTone.info,
                      icon: Icons.info_outline,
                    ),
                    const SizedBox(height: 14),
                  ],
                  if (_error != null) ...[
                    _Banner(
                      message: _error!,
                      tone: StatusTone.danger,
                      icon: Icons.error_outline,
                    ),
                    const SizedBox(height: 14),
                  ],
                  Form(
                    key: _formKey,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (_needsSetup) ...[
                          TextFormField(
                            controller: _nameController,
                            textInputAction: TextInputAction.next,
                            textCapitalization: TextCapitalization.words,
                            decoration: InputDecoration(
                              labelText: 'Full name',
                              prefixIcon: const Icon(Icons.person_outline),
                              errorText: _fieldErrors['name']?.first,
                            ),
                            validator: (value) =>
                                (value == null || value.trim().isEmpty)
                                ? 'Enter your name'
                                : null,
                          ),
                          const SizedBox(height: 12),
                        ],
                        TextFormField(
                          controller: _identifierController,
                          keyboardType: TextInputType.emailAddress,
                          textInputAction: TextInputAction.next,
                          autofillHints: const [AutofillHints.username],
                          decoration: InputDecoration(
                            labelText: 'Email, username or phone',
                            prefixIcon: const Icon(Icons.person_outline),
                            errorText: _fieldErrors['identifier']?.first ??
                                _fieldErrors['email']?.first,
                          ),
                          validator: (value) {
                            final text = value?.trim() ?? '';
                            if (text.isEmpty) return 'Enter your email, username or phone';
                            return null;
                          },
                        ),
                        const SizedBox(height: 12),
                        TextFormField(
                          controller: _passwordController,
                          obscureText: _obscurePassword,
                          textInputAction: TextInputAction.done,
                          autofillHints: const [AutofillHints.password],
                          onFieldSubmitted: (_) => _submit(),
                          decoration: InputDecoration(
                            labelText: 'Password',
                            prefixIcon: const Icon(Icons.lock_outline),
                            errorText: _fieldErrors['password']?.first,
                            suffixIcon: IconButton(
                              tooltip: _obscurePassword
                                  ? 'Show password'
                                  : 'Hide password',
                              onPressed: () => setState(
                                () => _obscurePassword = !_obscurePassword,
                              ),
                              icon: Icon(
                                _obscurePassword
                                    ? Icons.visibility_outlined
                                    : Icons.visibility_off_outlined,
                              ),
                            ),
                          ),
                          validator: (value) => (value == null || value.isEmpty)
                              ? 'Enter your password'
                              : null,
                        ),
                        if (_needsSetup) ...[
                          const SizedBox(height: 10),
                          const Text(
                            'Use at least 12 characters with an uppercase letter, '
                            'a lowercase letter and a number.',
                            style: TextStyle(
                              fontSize: 11.5,
                              color: AppColors.inkMuted,
                              height: 1.4,
                            ),
                          ),
                        ],
                        const SizedBox(height: 20),
                        FilledButton(
                          onPressed: _submitting || _checkingSetup
                              ? null
                              : _submit,
                          child: _submitting
                              ? const SizedBox(
                                  width: 20,
                                  height: 20,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2.2,
                                    color: Colors.white,
                                  ),
                                )
                              : Text(
                                  _needsSetup
                                      ? 'Create administrator'
                                      : 'Sign in',
                                ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _LoginHeader extends StatelessWidget {
  const _LoginHeader();

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const BrandMark(size: 52),
        const SizedBox(height: 18),
        const Text(
          'Virallink Operations',
          style: TextStyle(
            fontSize: 26,
            fontWeight: FontWeight.w800,
            letterSpacing: -0.6,
            height: 1.15,
          ),
        ),
        const SizedBox(height: 7),
        Text(
          'Sign in to manage tasks, clients and the day-to-day work of the studio.',
          style: TextStyle(
            fontSize: 13.5,
            height: 1.5,
            color: AppColors.inkMuted.withValues(alpha: 0.95),
          ),
        ),
      ],
    );
  }
}

class _Banner extends StatelessWidget {
  const _Banner({
    required this.message,
    required this.tone,
    required this.icon,
  });

  final String message;
  final StatusTone tone;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final colors = ToneColors.of(tone);
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: colors.background,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: colors.foreground.withValues(alpha: 0.18)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: colors.foreground),
          const SizedBox(width: 9),
          Expanded(
            child: Text(
              message,
              style: TextStyle(
                fontSize: 12.5,
                height: 1.4,
                color: colors.foreground,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
