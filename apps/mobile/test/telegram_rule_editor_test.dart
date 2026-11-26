import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:virallink_mobile/core/network/api_client.dart';
import 'package:virallink_mobile/core/storage/token_store.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:virallink_mobile/core/providers.dart';
import 'package:virallink_mobile/features/telegram/data/telegram_auto_reply_repository.dart';
import 'package:virallink_mobile/features/telegram/domain/telegram_auto_reply.dart';
import 'package:virallink_mobile/features/telegram/presentation/telegram_auto_reply_screen.dart';

class _FakeRepo extends TelegramAutoReplyRepository {
  _FakeRepo() : super(ApiClient(tokenStore: TokenStore()));

  @override
  Future<TelegramRule> saveRule(
    int accountId, {
    int? ruleId,
    required Map<String, dynamic> body,
  }) async {
    return TelegramRule(
      id: ruleId ?? 1,
      accountId: accountId,
      name: '${body['name']}',
    );
  }

  @override
  Future<List<TelegramAutoReplyAccount>> accounts() async {
    return [
      TelegramAutoReplyAccount(
        id: 2,
        name: 'Test bot',
        settings: const TelegramAutoReplySettings(),
      ),
    ];
  }

  @override
  Future<List<TelegramRule>> rules(int accountId) async {
    return [
      TelegramRule(
        id: 4,
        accountId: accountId,
        name: 'greeting',
        trigger: 'exact',
        keywords: 'hi',
        replyText: 'Hello!',
      ),
    ];
  }

  @override
  Future<List<TelegramCatalogItem>> catalog() async => const [];

  @override
  Future<TelegramMedia> uploadMedia(
    String filePath, {
    required String folder,
  }) async {
    return const TelegramMedia(id: 1);
  }
}

void main() {
  testWidgets('rule editor dialog renders an existing rule', (tester) async {
    final rule = TelegramRule(
      id: 4,
      accountId: 2,
      name: 'greeting',
      trigger: 'exact',
      keywords: 'hi',
      replyText: 'Hello!',
    );

    await tester.pumpWidget(
      MaterialApp(
        home: RuleEditorDialog(
          repo: _FakeRepo(),
          accountId: 2,
          rule: rule,
        ),
      ),
    );

    expect(find.text('Edit rule'), findsOneWidget);
    expect(find.text('Reply text'), findsOneWidget);
    expect(find.text('greeting'), findsOneWidget);
  });

  testWidgets('editor falls back for an unknown trigger', (tester) async {
    final rule = TelegramRule(
      id: 9,
      accountId: 2,
      name: 'legacy',
      trigger: 'contains',
      keywords: 'hi',
    );

    await tester.pumpWidget(
      MaterialApp(
        home: RuleEditorDialog(
          repo: _FakeRepo(),
          accountId: 2,
          rule: rule,
        ),
      ),
    );

    expect(find.text('Edit rule'), findsOneWidget);
    expect(find.text('Exact phrase'), findsOneWidget);
  });

  testWidgets('tapping Edit in the rules tab opens the editor', (tester) async {
    final repo = _FakeRepo();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          telegramAutoReplyRepositoryProvider.overrideWithValue(repo),
        ],
        child: const MaterialApp(home: TelegramAutoReplyScreen()),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Rules'));
    await tester.pumpAndSettle();
    expect(find.text('greeting'), findsOneWidget);

    await tester.tap(find.text('Edit'));
    await tester.pumpAndSettle();

    expect(find.text('Edit rule'), findsOneWidget);
  });
}
