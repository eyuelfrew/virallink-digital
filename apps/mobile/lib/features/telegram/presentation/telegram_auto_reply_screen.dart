import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/providers.dart';
import '../../../shared/widgets/common.dart';
import '../data/telegram_auto_reply_repository.dart';
import '../domain/telegram_auto_reply.dart';

/// Manage the auto-reply engine for the signed-in person's own connections.
///
/// This is deliberately a pushed screen rather than a shell tab: it is a
/// configuration area, like the web console's Telegram page.
class TelegramAutoReplyScreen extends ConsumerStatefulWidget {
  const TelegramAutoReplyScreen({super.key});

  @override
  ConsumerState<TelegramAutoReplyScreen> createState() =>
      _TelegramAutoReplyScreenState();
}

class _TelegramAutoReplyScreenState extends ConsumerState<TelegramAutoReplyScreen> {
  bool _loading = true;
  bool _saving = false;
  String? _error;

  List<TelegramAutoReplyAccount> _accounts = const [];
  int? _accountId;
  List<TelegramRule> _rules = const [];
  List<TelegramCatalogItem> _catalog = const [];

  final _welcome = TextEditingController();
  final _away = TextEditingController();
  final _catalogIntro = TextEditingController();
  final _menuTitle = TextEditingController();
  final _awayCooldown = TextEditingController();

  bool _isEnabled = true;
  bool _awayMode = true;
  bool _catalogEnabled = true;
  bool _menuEnabled = false;
  bool _replyNew = true;
  bool _replyReturning = true;

  TelegramAutoReplyRepository get _repo =>
      ref.read(telegramAutoReplyRepositoryProvider);

  @override
  void initState() {
    super.initState();
    _loadAccounts();
  }

  @override
  void dispose() {
    _welcome.dispose();
    _away.dispose();
    _catalogIntro.dispose();
    _menuTitle.dispose();
    _awayCooldown.dispose();
    super.dispose();
  }

  Future<void> _loadAccounts() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final accounts = await _repo.accounts();
      final selected = accounts.isEmpty
          ? null
          : accounts.any((item) => item.id == _accountId)
              ? _accountId
              : accounts.first.id;
      setState(() => _accounts = accounts);
      if (selected != null) await _loadAccount(selected);
    } catch (error) {
      setState(() => _error = messageForError(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loadAccount(int accountId) async {
    setState(() {
      _loading = true;
      _accountId = accountId;
      _error = null;
    });
    try {
      final results = await Future.wait([
        _repo.rules(accountId),
        _repo.catalog(),
      ]);
      final account = _accounts.firstWhere(
        (item) => item.id == accountId,
        orElse: () => _accounts.first,
      );
      final settings = account.settings;
      setState(() {
        _rules = results[0] as List<TelegramRule>;
        _catalog = results[1] as List<TelegramCatalogItem>;
        if (settings != null) {
          _welcome.text = settings.welcomeMessage;
          _away.text = settings.awayMessage;
          _catalogIntro.text = settings.catalogIntro;
          _menuTitle.text = settings.menuTitle;
          _awayCooldown.text = '${settings.awayCooldownMinutes}';
          _isEnabled = settings.isEnabled;
          _awayMode = settings.awayMode;
          _catalogEnabled = settings.catalogEnabled;
          _menuEnabled = settings.menuEnabled;
          _replyNew = settings.replyToNewChats;
          _replyReturning = settings.replyToReturningChats;
        }
      });
    } catch (error) {
      setState(() => _error = messageForError(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _snack(String message, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: error ? Colors.red.shade700 : null,
      ),
    );
  }

  Future<void> _saveSettings() async {
    final accountId = _accountId;
    if (accountId == null) return;
    setState(() => _saving = true);
    try {
      await _repo.saveSettings(accountId, {
        'isEnabled': _isEnabled,
        'welcomeMessage': _welcome.text.trim(),
        'awayMessage': _away.text.trim(),
        'awayMode': _awayMode,
        'awayCooldownMinutes': int.tryParse(_awayCooldown.text.trim()) ?? 360,
        'catalogEnabled': _catalogEnabled,
        'catalogIntro': _catalogIntro.text.trim(),
        'menuEnabled': _menuEnabled,
        'menuTitle': _menuTitle.text.trim(),
        'replyToNewChats': _replyNew,
        'replyToReturningChats': _replyReturning,
      });
      _snack('Settings saved.');
    } catch (error) {
      _snack(messageForError(error), error: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    // The TabBar lives in the AppBar, so the controller must wrap the whole
    // Scaffold — not just the body.
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Auto-reply'),
          bottom: _accounts.isEmpty
              ? null
              : const TabBar(
                  tabs: [
                    Tab(text: 'Settings'),
                    Tab(text: 'Rules'),
                    Tab(text: 'Catalog'),
                  ],
                ),
        ),
        body: _buildBody(),
      ),
    );
  }

  Widget _buildBody() {
    if (_loading && _accounts.isEmpty) {
      return const LoadingView(label: 'Loading your connections…');
    }
    if (_error != null && _accounts.isEmpty) {
      return ErrorState(message: _error!, onRetry: _loadAccounts);
    }
    if (_accounts.isEmpty) {
      return const EmptyState(
        icon: Icons.smart_toy_outlined,
        title: 'No auto-reply connection',
        message:
            'Link your personal Telegram account under "My Telegram", or connect a bot in the web admin, before configuring auto-replies.',
      );
    }

    return SafeArea(
      child: Column(
        children: [
          if (_accounts.length > 1) _accountSelector(),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: Text(
                _error!,
                style: const TextStyle(color: Colors.red),
              ),
            ),
          Expanded(
            child: _loading
                ? const LoadingView(label: 'Loading…')
                : TabBarView(
                    children: [
                      _settingsTab(),
                      _rulesTab(),
                      _catalogTab(),
                    ],
                  ),
          ),
        ],
      ),
    );
  }

  Widget _accountSelector() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: DropdownButtonFormField<int>(
        initialValue: _accountId,
        decoration: const InputDecoration(
          labelText: 'Connection',
          prefixIcon: Icon(Icons.alternate_email),
        ),
        items: [
          for (final account in _accounts)
            DropdownMenuItem<int>(
              value: account.id,
              child: Text(account.displayName),
            ),
        ],
        onChanged: (value) {
          if (value != null && value != _accountId) _loadAccount(value);
        },
      ),
    );
  }

  Widget _settingsTab() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        SurfaceCard(
          child: Column(
            children: [
              SwitchListTile(
                value: _isEnabled,
                onChanged: (value) => setState(() => _isEnabled = value),
                title: const Text('Enable auto-reply'),
                subtitle: const Text('Master switch for this connection.'),
              ),
              SwitchListTile(
                value: _replyNew,
                onChanged: (value) => setState(() => _replyNew = value),
                title: const Text('Reply to new chats'),
              ),
              SwitchListTile(
                value: _replyReturning,
                onChanged: (value) => setState(() => _replyReturning = value),
                title: const Text('Reply to returning chats'),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        SurfaceCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Welcome message',
                  style: TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 8),
              TextField(
                controller: _welcome,
                maxLines: 3,
                decoration: const InputDecoration(
                  hintText: 'Shown when someone starts a new chat',
                ),
              ),
              const SizedBox(height: 16),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: _awayMode,
                onChanged: (value) => setState(() => _awayMode = value),
                title: const Text('Away mode'),
                subtitle: const Text(
                  'Answer messages that no rule matched. Set a cooldown to avoid replying to every message.',
                ),
              ),
              TextField(
                controller: _away,
                maxLines: 3,
                decoration: const InputDecoration(
                  hintText: 'Away message',
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _awayCooldown,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Away cooldown (minutes)',
                  helperText: '0 means reply to every unmatched message.',
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        SurfaceCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: _catalogEnabled,
                onChanged: (value) => setState(() => _catalogEnabled = value),
                title: const Text('Send catalog'),
              ),
              TextField(
                controller: _catalogIntro,
                maxLines: 2,
                decoration: const InputDecoration(labelText: 'Catalog intro'),
              ),
              const SizedBox(height: 16),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: _menuEnabled,
                onChanged: (value) => setState(() => _menuEnabled = value),
                title: const Text('Chat menu'),
              ),
              TextField(
                controller: _menuTitle,
                decoration: const InputDecoration(labelText: 'Menu title'),
              ),
            ],
          ),
        ),
        const SizedBox(height: 18),
        FilledButton.icon(
          onPressed: _saving ? null : _saveSettings,
          icon: _saving
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.save_outlined),
          label: Text(_saving ? 'Saving…' : 'Save settings'),
        ),
      ],
    );
  }

  Widget _rulesTab() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Align(
          alignment: Alignment.centerLeft,
          child: FilledButton.icon(
            onPressed: () => _openRuleEditor(null),
            icon: const Icon(Icons.add),
            label: const Text('New rule'),
          ),
        ),
        const SizedBox(height: 12),
        if (_rules.isEmpty)
          const EmptyState(
            icon: Icons.rule_outlined,
            title: 'No rules yet',
            message: 'Add a rule to answer "hi", a keyword, or any message.',
            compact: true,
          )
        else
          for (final rule in _rules)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: SurfaceCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            rule.name.isEmpty ? 'Rule #${rule.id}' : rule.name,
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                        ),
                        if (!rule.isActive)
                          const Text('off',
                              style: TextStyle(color: Colors.grey)),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text('Trigger: ${rule.trigger}'),
                    if (rule.keywords.isNotEmpty) Text('Keywords: ${rule.keywords}'),
                    if (rule.replyText.isNotEmpty)
                      Text(
                        rule.replyText,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    if (rule.imageMediaIds.isNotEmpty || rule.audioMediaId != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 6),
                        child: Text(
                          '${rule.imageMediaIds.length} image(s)'
                          '${rule.audioMediaId != null ? ' · audio' : ''}',
                          style: const TextStyle(fontSize: 12),
                        ),
                      ),
                    const SizedBox(height: 8),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        TextButton(
                          onPressed: () => _openRuleEditor(rule),
                          child: const Text('Edit'),
                        ),
                        TextButton(
                          onPressed: () => _deleteRule(rule),
                          child: const Text(
                            'Delete',
                            style: TextStyle(color: Colors.red),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
      ],
    );
  }

  Future<void> _openRuleEditor(TelegramRule? rule) async {
    final accountId = _accountId;
    if (accountId == null) return;
    final changed = await showDialog<bool>(
      context: context,
      builder: (_) => RuleEditorDialog(
        repo: _repo,
        accountId: accountId,
        rule: rule,
      ),
    );
    if (changed == true) await _loadAccount(accountId);
  }

  Future<void> _deleteRule(TelegramRule rule) async {
    final accountId = _accountId;
    if (accountId == null) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete rule?'),
        content: Text('Delete "${rule.name}"? This cannot be undone.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await _repo.deleteRule(accountId, rule.id);
      await _loadAccount(accountId);
      _snack('Rule deleted.');
    } catch (error) {
      _snack(messageForError(error), error: true);
    }
  }

  Widget _catalogTab() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Align(
          alignment: Alignment.centerLeft,
          child: FilledButton.icon(
            onPressed: () => _openCatalogEditor(null),
            icon: const Icon(Icons.add),
            label: const Text('New catalog item'),
          ),
        ),
        const SizedBox(height: 12),
        if (_catalog.isEmpty)
          const EmptyState(
            icon: Icons.inventory_2_outlined,
            title: 'Catalog is empty',
            message: 'Add products or services with photos for the bot to send.',
            compact: true,
          )
        else
          for (final item in _catalog)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: SurfaceCard(
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(item.name,
                              style: const TextStyle(fontWeight: FontWeight.w700)),
                          if (item.description.isNotEmpty)
                            Text(item.description,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis),
                          Text(item.price.isEmpty ? 'Price on request' : item.price),
                        ],
                      ),
                    ),
                    TextButton(
                      onPressed: () => _openCatalogEditor(item),
                      child: const Text('Edit'),
                    ),
                    TextButton(
                      onPressed: () => _deleteCatalogItem(item),
                      child: const Text('Delete',
                          style: TextStyle(color: Colors.red)),
                    ),
                  ],
                ),
              ),
            ),
      ],
    );
  }

  Future<void> _openCatalogEditor(TelegramCatalogItem? item) async {
    final changed = await showDialog<bool>(
      context: context,
      builder: (_) => CatalogEditorDialog(repo: _repo, item: item),
    );
    if (changed == true && _accountId != null) {
      await _loadAccount(_accountId!);
    }
  }

  Future<void> _deleteCatalogItem(TelegramCatalogItem item) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete item?'),
        content: Text('Delete "${item.name}" from the catalog?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await _repo.deleteCatalogItem(item.id);
      if (_accountId != null) await _loadAccount(_accountId!);
      _snack('Catalog item deleted.');
    } catch (error) {
      _snack(messageForError(error), error: true);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Rule editor                                                                 */
/* -------------------------------------------------------------------------- */

class RuleEditorDialog extends StatefulWidget {
  const RuleEditorDialog({
    super.key,
    required this.repo,
    required this.accountId,
    this.rule,
  });

  final TelegramAutoReplyRepository repo;
  final int accountId;
  final TelegramRule? rule;

  @override
  State<RuleEditorDialog> createState() => _RuleEditorDialogState();
}

class _RuleEditorDialogState extends State<RuleEditorDialog> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _keywords = TextEditingController();
  final _replyText = TextEditingController();
  final _cooldown = TextEditingController();
  final _priority = TextEditingController();

  late String _trigger;
  late List<int> _imageIds;
  late List<String> _imagePaths;
  int? _audioId;
  String? _audioName;
  bool _sendCatalog = false;
  bool _showMenu = false;
  bool _stopProcessing = true;
  bool _isActive = true;
  bool _busy = false;
  String? _error;

  static const _triggers = [
    'exact',
    'keyword',
    'any',
    'new_chat',
    'returning_chat',
    'regex',
  ];
  static const _triggerLabels = {
    'exact': 'Exact phrase',
    'keyword': 'Contains keyword',
    'any': 'Any message',
    'new_chat': 'New chat',
    'returning_chat': 'Returning chat',
    'regex': 'Regular expression',
  };

  @override
  void initState() {
    super.initState();
    final rule = widget.rule;
    _name.text = rule?.name ?? '';
    _keywords.text = rule?.keywords ?? '';
    _replyText.text = rule?.replyText ?? '';
    _cooldown.text = '${rule?.cooldownMinutes ?? 0}';
    _priority.text = '${rule?.priority ?? 0}';
    final storedTrigger = rule?.trigger ?? 'exact';
    // A rule saved by an older/other client may carry a trigger we don't list.
    // Falling back keeps the dialog from asserting on an unknown dropdown value.
    _trigger = _triggers.contains(storedTrigger) ? storedTrigger : 'exact';
    _imageIds = [...(rule?.imageMediaIds ?? const <int>[])];
    _imagePaths = const [];
    _audioId = rule?.audioMediaId;
    _sendCatalog = rule?.sendCatalog ?? false;
    _showMenu = rule?.showMenu ?? false;
    _stopProcessing = rule?.stopProcessing ?? true;
    _isActive = rule?.isActive ?? true;
  }

  @override
  void dispose() {
    _name.dispose();
    _keywords.dispose();
    _replyText.dispose();
    _cooldown.dispose();
    _priority.dispose();
    super.dispose();
  }

  Future<void> _pickImages({required bool camera}) async {
    final picker = ImagePicker();
    final picked = camera
        ? [
            await picker.pickImage(
              source: ImageSource.camera,
              imageQuality: 85,
              maxWidth: 1600,
            ),
          ].whereType<XFile>().toList()
        : await picker.pickMultiImage(imageQuality: 85, maxWidth: 1600);

    if (picked.isEmpty) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      for (final file in picked) {
        final media = await widget.repo.uploadMedia(
          file.path,
          folder: 'telegram-rules',
        );
        if (!mounted) return;
        setState(() {
          _imageIds.add(media.id);
          _imagePaths.add(file.path);
        });
      }
    } catch (error) {
      setState(() => _error = messageForError(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _pickAudio() async {
    final picked = await FilePickerPlatform.instance.pickFiles(
      type: FileType.audio,
    );
    if (picked.isEmpty) return;
    final path = picked.first.path;
    if (path == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final media = await widget.repo.uploadMedia(
        path,
        folder: 'telegram-audio',
      );
      if (!mounted) return;
      setState(() {
        _audioId = media.id;
        _audioName = path.split(RegExp(r'[\\/]')).last;
      });
    } catch (error) {
      setState(() => _error = messageForError(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.repo.saveRule(
        widget.accountId,
        ruleId: widget.rule?.id,
        body: {
          'name': _name.text.trim(),
          'trigger': _trigger,
          'keywords': _keywords.text.trim(),
          'replyText': _replyText.text,
          'imageMediaIds': _imageIds,
          'audioMediaId': _audioId,
          'sendCatalog': _sendCatalog,
          'showMenu': _showMenu,
          'cooldownMinutes': int.tryParse(_cooldown.text.trim()) ?? 0,
          'priority': int.tryParse(_priority.text.trim()) ?? 0,
          'stopProcessing': _stopProcessing,
          'isActive': _isActive,
        },
      );
      if (mounted) Navigator.pop(context, true);
    } catch (error) {
      setState(() => _error = messageForError(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 560, maxHeight: 700),
        child: Form(
          key: _form,
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 18, 20, 8),
                child: Text(
                  widget.rule == null ? 'New rule' : 'Edit rule',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
              ),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: Text(_error!, style: const TextStyle(color: Colors.red)),
                ),
              Expanded(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      TextFormField(
                        controller: _name,
                        decoration: const InputDecoration(labelText: 'Name'),
                        validator: (value) => value == null || value.trim().isEmpty
                            ? 'Give the rule a name'
                            : null,
                      ),
                      const SizedBox(height: 12),
                      DropdownButtonFormField<String>(
                        initialValue: _trigger,
                        decoration: const InputDecoration(labelText: 'Trigger'),
                        items: [
                          for (final trigger in _triggers)
                            DropdownMenuItem<String>(
                              value: trigger,
                              child: Text(_triggerLabels[trigger] ?? trigger),
                            ),
                        ],
                        onChanged: (value) {
                          if (value != null) setState(() => _trigger = value);
                        },
                      ),
                      if (_trigger == 'exact' || _trigger == 'keyword' || _trigger == 'regex') ...[
                        const SizedBox(height: 12),
                        TextFormField(
                          controller: _keywords,
                          decoration: InputDecoration(
                            labelText: _trigger == 'regex'
                                ? 'Regular expression'
                                : 'Keywords (comma or newline separated)',
                            helperText: _trigger == 'exact'
                                ? 'The whole message must match one phrase.'
                                : null,
                          ),
                          maxLines: 2,
                        ),
                      ],
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _replyText,
                        decoration: const InputDecoration(
                          labelText: 'Reply text',
                          helperText:
                              'With images, this becomes the image caption on personal accounts.',
                        ),
                        maxLines: 4,
                      ),
                      const SizedBox(height: 18),
                      const Text('Images',
                          style: TextStyle(fontWeight: FontWeight.w700)),
                      const SizedBox(height: 8),
                      if (_imagePaths.isNotEmpty)
                        SizedBox(
                          height: 64,
                          child: ListView.separated(
                            scrollDirection: Axis.horizontal,
                            itemCount: _imagePaths.length,
                            separatorBuilder: (_, _) => const SizedBox(width: 8),
                            itemBuilder: (context, index) => ClipRRect(
                              borderRadius: BorderRadius.circular(8),
                              child: Image.file(
                                File(_imagePaths[index]),
                                width: 64,
                                height: 64,
                                fit: BoxFit.cover,
                              ),
                            ),
                          ),
                        ),
                      if (widget.rule != null && _imagePaths.isEmpty && _imageIds.isNotEmpty)
                        Text('${_imageIds.length} existing image(s) attached'),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          OutlinedButton.icon(
                            onPressed: _busy ? null : () => _pickImages(camera: false),
                            icon: const Icon(Icons.photo_library_outlined),
                            label: const Text('Gallery'),
                          ),
                          const SizedBox(width: 8),
                          OutlinedButton.icon(
                            onPressed: _busy ? null : () => _pickImages(camera: true),
                            icon: const Icon(Icons.camera_alt_outlined),
                            label: const Text('Camera'),
                          ),
                        ],
                      ),
                      const SizedBox(height: 18),
                      const Text('Audio',
                          style: TextStyle(fontWeight: FontWeight.w700)),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              _audioName ??
                                  (_audioId != null ? 'Audio attached' : 'No audio'),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          OutlinedButton.icon(
                            onPressed: _busy ? null : _pickAudio,
                            icon: const Icon(Icons.audiotrack_outlined),
                            label: const Text('Choose'),
                          ),
                        ],
                      ),
                      const SizedBox(height: 18),
                      Row(
                        children: [
                          Expanded(
                            child: TextFormField(
                              controller: _cooldown,
                              keyboardType: TextInputType.number,
                              decoration: const InputDecoration(
                                labelText: 'Cooldown (min)',
                              ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: TextFormField(
                              controller: _priority,
                              keyboardType: TextInputType.number,
                              decoration: const InputDecoration(
                                labelText: 'Priority',
                              ),
                            ),
                          ),
                        ],
                      ),
                      SwitchListTile(
                        contentPadding: EdgeInsets.zero,
                        value: _sendCatalog,
                        onChanged: (value) => setState(() => _sendCatalog = value),
                        title: const Text('Also send catalog'),
                      ),
                      SwitchListTile(
                        contentPadding: EdgeInsets.zero,
                        value: _showMenu,
                        onChanged: (value) => setState(() => _showMenu = value),
                        title: const Text('Show chat menu'),
                      ),
                      SwitchListTile(
                        contentPadding: EdgeInsets.zero,
                        value: _stopProcessing,
                        onChanged: (value) =>
                            setState(() => _stopProcessing = value),
                        title: const Text('Stop after this rule'),
                      ),
                      SwitchListTile(
                        contentPadding: EdgeInsets.zero,
                        value: _isActive,
                        onChanged: (value) => setState(() => _isActive = value),
                        title: const Text('Rule active'),
                      ),
                    ],
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 18),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    TextButton(
                      onPressed: _busy ? null : () => Navigator.pop(context, false),
                      child: const Text('Cancel'),
                    ),
                    const SizedBox(width: 8),
                    FilledButton(
                      onPressed: _busy ? null : _save,
                      child: _busy
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Text('Save rule'),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Catalog editor                                                              */
/* -------------------------------------------------------------------------- */

class CatalogEditorDialog extends StatefulWidget {
  const CatalogEditorDialog({
    super.key,
    required this.repo,
    this.item,
  });

  final TelegramAutoReplyRepository repo;
  final TelegramCatalogItem? item;

  @override
  State<CatalogEditorDialog> createState() => _CatalogEditorDialogState();
}

class _CatalogEditorDialogState extends State<CatalogEditorDialog> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _description = TextEditingController();
  final _price = TextEditingController();
  final _currency = TextEditingController();
  final _order = TextEditingController();

  late List<int> _imageIds;
  late List<String> _imagePaths;
  bool _isActive = true;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final item = widget.item;
    _name.text = item?.name ?? '';
    _description.text = item?.description ?? '';
    _price.text = item?.price ?? '';
    _currency.text = item?.currency ?? 'ETB';
    _order.text = '${item?.displayOrder ?? 0}';
    _imageIds = [...(item?.imageMediaIds ?? const <int>[])];
    if (item?.imageMediaId != null) _imageIds.add(item!.imageMediaId!);
    _imagePaths = const [];
    _isActive = item?.isActive ?? true;
  }

  @override
  void dispose() {
    _name.dispose();
    _description.dispose();
    _price.dispose();
    _currency.dispose();
    _order.dispose();
    super.dispose();
  }

  Future<void> _pickImages({required bool camera}) async {
    final picker = ImagePicker();
    final picked = camera
        ? [
            await picker.pickImage(
              source: ImageSource.camera,
              imageQuality: 85,
              maxWidth: 1600,
            ),
          ].whereType<XFile>().toList()
        : await picker.pickMultiImage(imageQuality: 85, maxWidth: 1600);
    if (picked.isEmpty) return;

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      for (final file in picked) {
        final media = await widget.repo.uploadMedia(
          file.path,
          folder: 'telegram-catalog',
        );
        if (!mounted) return;
        setState(() {
          _imageIds.add(media.id);
          _imagePaths.add(file.path);
        });
      }
    } catch (error) {
      setState(() => _error = messageForError(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.repo.saveCatalogItem(
        itemId: widget.item?.id,
        body: {
          'name': _name.text.trim(),
          'description': _description.text.trim(),
          'price': _price.text.trim(),
          'currency': _currency.text.trim(),
          'imageMediaId': _imageIds.isNotEmpty ? _imageIds.first : null,
          'imageMediaIds': _imageIds,
          'isActive': _isActive,
          'displayOrder': int.tryParse(_order.text.trim()) ?? 0,
        },
      );
      if (mounted) Navigator.pop(context, true);
    } catch (error) {
      setState(() => _error = messageForError(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 520, maxHeight: 680),
        child: Form(
          key: _form,
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 18, 20, 8),
                child: Text(
                  widget.item == null ? 'New catalog item' : 'Edit catalog item',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
              ),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: Text(_error!, style: const TextStyle(color: Colors.red)),
                ),
              Expanded(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      TextFormField(
                        controller: _name,
                        decoration: const InputDecoration(labelText: 'Name'),
                        validator: (value) => value == null || value.trim().isEmpty
                            ? 'Name is required'
                            : null,
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _description,
                        maxLines: 3,
                        decoration: const InputDecoration(
                          labelText: 'Description',
                          helperText: 'Sent as the image caption.',
                        ),
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: TextFormField(
                              controller: _price,
                              decoration: const InputDecoration(labelText: 'Price'),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: TextFormField(
                              controller: _currency,
                              decoration: const InputDecoration(labelText: 'Currency'),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _order,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(labelText: 'Display order'),
                      ),
                      const SizedBox(height: 18),
                      const Text('Images',
                          style: TextStyle(fontWeight: FontWeight.w700)),
                      const SizedBox(height: 8),
                      if (_imagePaths.isNotEmpty)
                        SizedBox(
                          height: 64,
                          child: ListView.separated(
                            scrollDirection: Axis.horizontal,
                            itemCount: _imagePaths.length,
                            separatorBuilder: (_, _) => const SizedBox(width: 8),
                            itemBuilder: (context, index) => ClipRRect(
                              borderRadius: BorderRadius.circular(8),
                              child: Image.file(
                                File(_imagePaths[index]),
                                width: 64,
                                height: 64,
                                fit: BoxFit.cover,
                              ),
                            ),
                          ),
                        ),
                      if (widget.item != null &&
                          _imagePaths.isEmpty &&
                          _imageIds.isNotEmpty)
                        Text('${_imageIds.length} existing image(s) attached'),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          OutlinedButton.icon(
                            onPressed: _busy ? null : () => _pickImages(camera: false),
                            icon: const Icon(Icons.photo_library_outlined),
                            label: const Text('Gallery'),
                          ),
                          const SizedBox(width: 8),
                          OutlinedButton.icon(
                            onPressed: _busy ? null : () => _pickImages(camera: true),
                            icon: const Icon(Icons.camera_alt_outlined),
                            label: const Text('Camera'),
                          ),
                        ],
                      ),
                      SwitchListTile(
                        contentPadding: EdgeInsets.zero,
                        value: _isActive,
                        onChanged: (value) => setState(() => _isActive = value),
                        title: const Text('Active'),
                      ),
                    ],
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 18),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    TextButton(
                      onPressed: _busy ? null : () => Navigator.pop(context, false),
                      child: const Text('Cancel'),
                    ),
                    const SizedBox(width: 8),
                    FilledButton(
                      onPressed: _busy ? null : _save,
                      child: _busy
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Text('Save'),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
