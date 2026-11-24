'use client';

import { useCallback, useEffect, useState } from 'react';
import { browserApiUrl } from '@/lib/config';
import {
  Ban,
  Eye,
  LayoutGrid,
  ListChecks,
  Music4,
  Package,
  Plug,
  RefreshCw,
  RotateCcw,
  Send,
  Settings,
  Trash2,
} from 'lucide-react';
import { AdminPanel, Tabs } from '@/components/admin/AdminUI';
import { MultiPhotoField } from '@/components/admin/MultiPhotoField';
import { AudioField } from '@/components/admin/AudioField';
import { PhotoField } from '@/components/admin/PhotoField';
import { TelegramAccountPanel } from '@/components/admin/TelegramAccountPanel';
import { TelegramMenuBuilder } from '@/components/admin/TelegramMenuBuilder';

const PROVIDER_LABELS = {
  env: 'Company bot',
  custom: 'Bot token',
  account: 'Personal account',
};

const TRIGGER_LABELS = {
  any: 'Any message',
  new_chat: 'New chat',
  returning_chat: 'Returning chat',
  keyword: 'Contains keyword',
  exact: 'Exact phrase',
  regex: 'Regular expression',
};

function accountLabel(account) {
  const username = account.botUsername || account.accountUsername;
  return `${account.name}${username ? ` (@${username})` : ''}`;
}

function accountStatusLabel(account) {
  if (!account) return '';
  return account.provider === 'account'
    ? account.connectionStatus || 'disconnected'
    : account.isActive
      ? 'active'
      : 'disabled';
}

function accountStatusTone(account) {
  const status = accountStatusLabel(account);
  if (status === 'connected' || status === 'active') return 'bg-success-bg text-success';
  if (status === 'code_sent' || status === 'password_required') return 'bg-warning-bg text-warning';
  if (status === 'error') return 'bg-danger-bg text-danger';
  return 'bg-surface-muted text-ink-muted';
}

function defaultRuleForm() {
  return {
    name: '',
    trigger: 'keyword',
    keywords: '',
    replyText: '',
    sendCatalog: false,
    images: [],
    audio: null,
    showMenu: false,
    cooldownMinutes: 0,
    priority: 0,
    stopProcessing: true,
    isActive: true,
  };
}

/**
 * Minutes as something a person can read: "6 hours 6 minutes", "45 minutes".
 *
 * The cooldown is the one number in this tab that is easy to set wrong, so it
 * is spelled out next to the field.
 */
function formatCooldown(minutes) {
  const total = Math.max(Number(minutes) || 0, 0);
  if (!total) return 'no wait at all';

  const hours = Math.floor(total / 60);
  const rest = total % 60;

  if (!hours) return `${rest} minute${rest === 1 ? '' : 's'}`;
  if (!rest) return `${hours} hour${hours === 1 ? '' : 's'}`;

  return `${hours} hour${hours === 1 ? '' : 's'} ${rest} minute${rest === 1 ? '' : 's'}`;
}

function defaultSettingsForm(settings) {
  return {
    isEnabled: settings?.isEnabled ?? true,
    welcomeMessage: settings?.welcomeMessage ?? '',
    awayMessage: settings?.awayMessage ?? '',
    awayMode: settings?.awayMode ?? false,
    awayCooldownMinutes: settings?.awayCooldownMinutes ?? 60,
    catalogEnabled: settings?.catalogEnabled ?? true,
    catalogIntro: settings?.catalogIntro ?? '',
    menuEnabled: settings?.menuEnabled ?? false,
    menuTitle: settings?.menuTitle ?? '',
    replyToNewChats: settings?.replyToNewChats ?? true,
    replyToReturningChats: settings?.replyToReturningChats ?? true,
  };
}

/**
 * What the auto-reply would do, in plain words.
 *
 * The headline is the outcome; the reason underneath is what turns "nothing
 * happened" into something an administrator can act on.
 */
function PreviewResult({ preview }) {
  const plan = preview?.plan || {};
  const chat = preview?.chat;

  const headlines = {
    rule: 'A reply rule would answer this message.',
    away: 'The away message would answer this message.',
    catalog: 'The catalogue would be sent.',
    new_chat: 'This is a new chat, so the welcome message would be sent.',
    none: 'Nothing would be sent.',
    blocked: 'This chat is blocked.',
    disabled: 'Auto-reply is switched off for this chat.',
    new_chats_disabled: 'This account does not answer new chats.',
    returning_chats_disabled: 'This account does not answer chats that already spoke to it.',
  };

  return (
    <div className="rounded-md border border-line bg-surface-muted p-3 text-sm">
      <p className="font-medium text-ink">{headlines[plan.kind] || 'Nothing would be sent.'}</p>

      {plan.rule ? (
        <p className="mt-1 text-xs text-ink-muted">
          Rule: <span className="font-medium text-ink-soft">{plan.rule.name}</span>
          {plan.rule.keywords ? ` · matches “${plan.rule.keywords}”` : ''}
        </p>
      ) : null}

      {chat?.lastAwayReplyAt ? (
        <p className="mt-1 text-xs text-ink-muted">
          Last away reply {formatWhen(chat.lastAwayReplyAt)}.
        </p>
      ) : null}

      {plan.blockedBy ? <p className="mt-1 text-xs text-warning">{plan.blockedBy}</p> : null}

      {plan.parts?.length ? (
        <ul className="mt-2 flex flex-col gap-2">
          {plan.parts.map((part, index) => (
            <li key={`${part.type}-${index}`} className="text-xs">
              <span className="font-medium text-ink-soft">{part.label}</span>
              {part.text ? (
                <p className="mt-0.5 whitespace-pre-wrap rounded border border-line bg-surface p-2 text-ink-muted">
                  {part.text}
                </p>
              ) : null}
              {part.count !== undefined ? (
                <p className="mt-0.5 text-ink-muted">{part.count} item(s)</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** A timestamp as "3 minutes ago" — the admin reads these, not ISO strings. */
function formatWhen(value) {
  if (!value) return '';

  const then = new Date(value);
  if (Number.isNaN(then.getTime())) return '';

  const minutes = Math.round((Date.now() - then.getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function TelegramAutoReplyPanel({
  mode = 'self',
  initialAccounts = [],
  canWriteCatalog = false,
  canUploadMedia = false,
  showAccountPanel = false,
}) {
  const adminMode = mode === 'admin';
  const accountsPath = browserApiUrl(adminMode ? '/api/telegram-auto-reply/accounts' : '/api/telegram-auto-reply');

  const [accounts, setAccounts] = useState(initialAccounts);
  const [selectedId, setSelectedId] = useState(initialAccounts?.[0]?.id ?? null);
  const [activeTab, setActiveTab] = useState(initialAccounts.length ? 'auto-reply' : 'connections');
  const [loading, setLoading] = useState(!initialAccounts.length);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [pending, setPending] = useState(false);

  const [connectToken, setConnectToken] = useState('');
  const [connectName, setConnectName] = useState('');
  const [companyToken, setCompanyToken] = useState('');
  const [companyName, setCompanyName] = useState('');

  const [settingsForm, setSettingsForm] = useState(defaultSettingsForm(initialAccounts?.[0]?.settings));
  const [testChatId, setTestChatId] = useState('');
  const [testMessage, setTestMessage] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [blockedChats, setBlockedChats] = useState([]);
  const [previewText, setPreviewText] = useState('');

  const [rules, setRules] = useState([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState(null);
  const [ruleForm, setRuleForm] = useState(defaultRuleForm());

  const [catalog, setCatalog] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [editingCatalogId, setEditingCatalogId] = useState(null);
  const [catalogForm, setCatalogForm] = useState({
    name: '',
    description: '',
    price: '',
    currency: 'ETB',
    imageMediaId: '',
    images: [],
    isActive: true,
    displayOrder: 0,
  });

  const loadAccounts = useCallback(async (preferredId) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(accountsPath, { cache: 'no-store', credentials: 'include' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error?.message || 'Could not load Telegram bots.');
      const nextAccounts = payload.data || [];
      setAccounts(nextAccounts);
      const nextSelected = preferredId && nextAccounts.some((account) => account.id === preferredId)
        ? preferredId
        : nextAccounts.some((account) => account.id === selectedId)
          ? selectedId
          : nextAccounts[0]?.id ?? null;
      setSelectedId(nextSelected);
      const selectedAccount = nextAccounts.find((account) => account.id === nextSelected);
      setSettingsForm(defaultSettingsForm(selectedAccount?.settings));
    } catch (loadError) {
      setError(loadError.message || 'Could not load Telegram bots.');
    } finally {
      setLoading(false);
    }
  }, [accountsPath, selectedId]);

  /**
   * Switch to another connection.
   *
   * The settings form has to be reloaded with it. Leaving the previous
   * connection's values in the form is how the wrong connection ends up
   * being overwritten: the form was edited, but the save went to whichever
   * connection was selected at that moment.
   */
  function selectAccount(accountId) {
    setSelectedId(accountId);
    const account = accounts.find((item) => item.id === accountId);
    setSettingsForm(defaultSettingsForm(account?.settings));
  }

  /**
   * The chats that are blocked, or whose auto-reply is switched off.
   *
   * There is no conversation list to load: the auto-reply keeps no transcript,
   * so a chat id and its two switches are all it holds.
   */
  const loadBlockedChats = useCallback(async () => {
    if (!selectedId) {
      setBlockedChats([]);
      return;
    }

    try {
      const response = await fetch(
        browserApiUrl(`/api/telegram-auto-reply/blocked-chats?accountId=${encodeURIComponent(selectedId)}`),
        { cache: 'no-store', credentials: 'include' },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error?.message || 'Could not load the blocked chats.');
      setBlockedChats(payload.data || []);
    } catch (loadError) {
      setError(loadError.message || 'Could not load the blocked chats.');
    }
  }, [selectedId]);

  const loadCatalog = useCallback(async () => {
    if (!adminMode) return;
    setCatalogLoading(true);
    try {
      const response = await fetch(browserApiUrl('/api/telegram-auto-reply/catalog'), { cache: 'no-store', credentials: 'include' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error?.message || 'Could not load catalog.');
      setCatalog(payload.data || []);
    } catch (loadError) {
      setError(loadError.message || 'Could not load catalog.');
    } finally {
      setCatalogLoading(false);
    }
  }, [adminMode]);

  const loadRules = useCallback(async (accountId) => {
    if (!accountId) {
      setRules([]);
      return;
    }

    setRulesLoading(true);
    try {
      const response = await fetch(browserApiUrl(`/api/telegram-auto-reply/${accountId}/rules`), { cache: 'no-store', credentials: 'include' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error?.message || 'Could not load reply rules.');
      setRules(payload.data || []);
    } catch (loadError) {
      setError(loadError.message || 'Could not load reply rules.');
    } finally {
      setRulesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialAccounts.length) loadAccounts();
  }, [initialAccounts.length, loadAccounts]);

  useEffect(() => {
    loadRules(selectedId);
  }, [loadRules, selectedId]);

  useEffect(() => {
    const selectedAccount = accounts.find((account) => account.id === selectedId);
    setSettingsForm(defaultSettingsForm(selectedAccount?.settings));
  }, [accounts, selectedId]);

  useEffect(() => {
    loadBlockedChats();
  }, [loadBlockedChats]);

  useEffect(() => {
    if (adminMode) loadCatalog();
  }, [adminMode, loadCatalog]);

  async function handleConnect(company = false) {
    const token = company ? companyToken : connectToken;
    const name = company ? companyName : connectName;
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        browserApiUrl(`/api/telegram-auto-reply${company ? '/company/connect' : '/connect'}`),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ token, name: name || undefined }),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error?.message || 'Could not connect that bot.');
      if (company) {
        setCompanyToken('');
        setCompanyName('');
      } else {
        setConnectToken('');
        setConnectName('');
      }
      setNotice('Bot connected.');
      await loadAccounts(payload.data?.id);
    } catch (connectError) {
      setError(connectError.message || 'Could not connect that bot.');
    } finally {
      setPending(false);
    }
  }

  async function handleSettingsSave(event) {
    event.preventDefault();
    if (!selectedId) return;
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(browserApiUrl(`/api/telegram-auto-reply/${selectedId}/settings`), {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsForm),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error?.message || 'Could not save settings.');
      setNotice('Settings saved.');
      await loadAccounts(selectedId);
    } catch (saveError) {
      setError(saveError.message || 'Could not save settings.');
    } finally {
      setPending(false);
    }
  }

  /**
   * Ask the API what the auto-reply would do with this chat's last message.
   *
   * The answer comes from the same matcher and the same cooldown the handler
   * uses, so it is not a guess: it is what would actually happen.
   */
  async function handlePreview(chatId = testChatId) {
    if (!selectedId) return;
    setPreviewLoading(true);
    try {
      const params = new URLSearchParams();
      if (chatId) params.set('chatId', chatId);
      if (previewText) params.set('text', previewText);

      const response = await fetch(
        browserApiUrl(`/api/telegram-auto-reply/${selectedId}/preview${params.toString() ? `?${params.toString()}` : ''}`),
        { cache: 'no-store', credentials: 'include' },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error?.message || 'Could not work out what would happen.');
      setPreview(payload.data);
    } catch (previewError) {
      setError(previewError.message || 'Could not work out what would happen.');
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }

  /** Let the away message answer again in this chat, now. */
  async function handleResetAway() {
    if (!selectedId) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(browserApiUrl(`/api/telegram-auto-reply/${selectedId}/reset-away`), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testChatId ? { chatId: Number(testChatId) } : {}),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error?.message || 'Could not clear the cooldown.');
      setNotice('The away message may answer again in that chat.');
      await handlePreview();
    } catch (resetError) {
      setError(resetError.message || 'Could not clear the cooldown.');
    } finally {
      setPending(false);
    }
  }

  async function handleTestMessage() {
    if (!selectedId) return;
    setTestSending(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(browserApiUrl(`/api/telegram-auto-reply/${selectedId}/test-message`), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: testChatId, text: testMessage }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error?.message || 'Could not send that message.');
      setNotice('Message sent. Check the chat in Telegram.');
    } catch (testError) {
      setError(testError.message || 'Could not send that message.');
    } finally {
      setTestSending(false);
    }
  }

  async function handleSync() {
    if (!selectedId) return;
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(browserApiUrl(`/api/telegram-auto-reply/${selectedId}/sync`), { method: 'POST', credentials: 'include' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error?.message || 'Could not sync webhook.');
      setNotice('Webhook synced.');
      await loadAccounts(selectedId);
    } catch (syncError) {
      setError(syncError.message || 'Could not sync webhook.');
    } finally {
      setPending(false);
    }
  }

  async function handleActiveToggle() {
    if (!selectedId) return;
    const account = accounts.find((item) => item.id === selectedId);
    if (!account) return;
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(browserApiUrl(`/api/telegram-auto-reply/${selectedId}/active`), {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !account.isActive }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error?.message || 'Could not update bot status.');
      setNotice(account.isActive ? 'Bot disabled.' : 'Bot enabled.');
      await loadAccounts(selectedId);
    } catch (statusError) {
      setError(statusError.message || 'Could not update bot status.');
    } finally {
      setPending(false);
    }
  }

  async function handleDisconnect() {
    if (!selectedId) return;
    if (!window.confirm('Disconnect this bot? Its webhook will be removed.')) return;
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(browserApiUrl(`/api/telegram-auto-reply/${selectedId}`), { method: 'DELETE', credentials: 'include' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error?.message || 'Could not disconnect bot.');
      setNotice('Bot disconnected.');
      await loadAccounts();
    } catch (disconnectError) {
      setError(disconnectError.message || 'Could not disconnect bot.');
    } finally {
      setPending(false);
    }
  }

  async function handleCatalogSubmit(event) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);
    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get('name') || '').trim(),
      description: String(form.get('description') || '').trim() || null,
      price: String(form.get('price') || '').trim() || null,
      currency: String(form.get('currency') || 'ETB').trim().toUpperCase(),
      imageMediaId: form.get('imageMediaId') ? Number(form.get('imageMediaId')) : null,
      imageMediaIds: catalogForm.images.map((image) => image.id),
      isActive: form.get('isActive') === 'on',
      displayOrder: Number(form.get('displayOrder') || 0),
    };

    try {
      const url = browserApiUrl(editingCatalogId
        ? `/api/telegram-auto-reply/catalog/${editingCatalogId}`
        : '/api/telegram-auto-reply/catalog');
      const response = await fetch(url, {
        method: editingCatalogId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error?.message || 'Could not save catalog item.');
      setNotice(editingCatalogId ? 'Catalog item updated.' : 'Catalog item created.');
      setEditingCatalogId(null);
      setCatalogForm({ name: '', description: '', price: '', currency: 'ETB', imageMediaId: '', images: [], isActive: true, displayOrder: 0 });
      event.currentTarget.reset();
      await loadCatalog();
    } catch (catalogError) {
      setError(catalogError.message || 'Could not save catalog item.');
    } finally {
      setPending(false);
    }
  }

  async function handleCatalogDelete(id) {
    if (!window.confirm('Delete this catalog item?')) return;
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(browserApiUrl(`/api/telegram-auto-reply/catalog/${id}`), { method: 'DELETE', credentials: 'include' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error?.message || 'Could not delete catalog item.');
      setNotice('Catalog item deleted.');
      await loadCatalog();
    } catch (deleteError) {
      setError(deleteError.message || 'Could not delete catalog item.');
    } finally {
      setPending(false);
    }
  }

  function startCatalogEdit(item) {
    setEditingCatalogId(item.id);
    setCatalogForm({
      name: item.name || '',
      description: item.description || '',
      price: item.price ?? '',
      currency: item.currency || 'ETB',
      imageMediaId: item.imageMediaId ? String(item.imageMediaId) : '',
      images: item.images || [],
      isActive: item.isActive ?? true,
      displayOrder: item.displayOrder ?? 0,
    });
  }

  async function handleRuleSubmit(event) {
    event.preventDefault();
    if (!selectedId) return;
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const url = browserApiUrl(editingRuleId
        ? `/api/telegram-auto-reply/${selectedId}/rules/${editingRuleId}`
        : `/api/telegram-auto-reply/${selectedId}/rules`);
      const response = await fetch(url, {
        method: editingRuleId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...ruleForm,
          imageMediaIds: ruleForm.images.map((image) => image.id),
          // null means "unlink the audio", which is what the API expects when
          // the file was removed rather than left alone.
          audioMediaId: ruleForm.audio?.id ?? null,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error?.message || 'Could not save reply rule.');
      setNotice(editingRuleId ? 'Reply rule updated.' : 'Reply rule created.');
      setEditingRuleId(null);
      setRuleForm(defaultRuleForm());
      await loadRules(selectedId);
    } catch (ruleError) {
      setError(ruleError.message || 'Could not save reply rule.');
    } finally {
      setPending(false);
    }
  }

  async function handleRuleDelete(ruleId) {
    if (!selectedId) return;
    if (!window.confirm('Delete this reply rule?')) return;
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(browserApiUrl(`/api/telegram-auto-reply/${selectedId}/rules/${ruleId}`), {
        method: 'DELETE',
        credentials: 'include',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error?.message || 'Could not delete reply rule.');
      setNotice('Reply rule deleted.');
      if (editingRuleId === ruleId) {
        setEditingRuleId(null);
        setRuleForm(defaultRuleForm());
      }
      await loadRules(selectedId);
    } catch (ruleError) {
      setError(ruleError.message || 'Could not delete reply rule.');
    } finally {
      setPending(false);
    }
  }

  function startRuleEdit(rule) {
    setEditingRuleId(rule.id);
    setRuleForm({
      name: rule.name || '',
      trigger: rule.trigger || 'keyword',
      keywords: rule.keywords || '',
      replyText: rule.replyText || '',
      sendCatalog: Boolean(rule.sendCatalog),
      images: rule.images || [],
      audio: rule.audio || null,
      showMenu: Boolean(rule.showMenu),
      cooldownMinutes: rule.cooldownMinutes ?? 0,
      priority: rule.priority ?? 0,
      stopProcessing: rule.stopProcessing ?? true,
      isActive: rule.isActive ?? true,
    });
  }

  /** Block a chat, or let it speak again. */
  async function handleChatSwitch(chatId, patch) {
    if (!selectedId) return;
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(browserApiUrl(`/api/telegram-auto-reply/${selectedId}/chat-switch`), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: Number(chatId), ...patch }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error?.message || 'Could not update that chat.');
      setNotice('Chat settings updated.');
      await loadBlockedChats();
      await handlePreview();
    } catch (updateError) {
      setError(updateError.message || 'Could not update that chat.');
    } finally {
      setPending(false);
    }
  }

  const selectedAccount = accounts.find((account) => account.id === selectedId) || null;

  const tabs = [
    { id: 'connections', label: 'Connections', icon: Plug },
    { id: 'auto-reply', label: 'Auto-reply', icon: Settings },
    { id: 'rules', label: 'Reply rules', icon: ListChecks },
    { id: 'menu', label: 'Chat menu', icon: LayoutGrid },
    ...(adminMode ? [{ id: 'catalog', label: 'Catalog', icon: Package }] : []),
  ];

  const noAccountPanel = (
    <AdminPanel
      title="No connection selected"
      description="Choose a connection above, or add a bot or personal Telegram account first."
    >
      <button
        type="button"
        onClick={() => setActiveTab('connections')}
        className="inline-flex h-10 items-center rounded-md bg-brand-500 px-4 text-sm font-semibold text-white"
      >
        Go to connections
      </button>
    </AdminPanel>
  );

  const botConnectionsPanel = (
    <AdminPanel
      title="Bot connections"
      description="Connect a bot with its @BotFather token. Personal Telegram accounts are signed in with the panel above."
    >
      <div className="flex flex-col gap-5">
        {accounts.length ? (
          <div className="overflow-hidden rounded-md border border-line">
            {accounts.map((account, index) => (
              <button
                key={account.id}
                type="button"
                onClick={() => selectAccount(account.id)}
                className={`flex w-full flex-col gap-2 px-4 py-3 text-left sm:flex-row sm:items-center sm:justify-between ${
                  index > 0 ? 'border-t border-line' : ''
                } ${selectedId === account.id ? 'bg-brand-50' : 'bg-surface hover:bg-surface-muted'}`}
              >
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium text-ink">{accountLabel(account)}</span>
                  <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-ink-muted">
                    {PROVIDER_LABELS[account.provider] || account.provider}
                  </span>
                </span>
                <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${accountStatusTone(account)}`}>
                  {accountStatusLabel(account)}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-muted">
            No Telegram connections yet. Connect a bot below or sign in with your own account above.
          </p>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-md border border-line p-4">
            <h3 className="text-sm font-semibold text-ink">Connect a bot</h3>
            <div className="mt-3 flex flex-col gap-3">
              <input
                value={connectToken}
                onChange={(event) => setConnectToken(event.target.value)}
                placeholder="Bot token from @BotFather"
                className="h-10 rounded-md border border-line px-3 text-sm"
              />
              <input
                value={connectName}
                onChange={(event) => setConnectName(event.target.value)}
                placeholder="Bot name (optional)"
                className="h-10 rounded-md border border-line px-3 text-sm"
              />
              <button
                type="button"
                disabled={pending || !connectToken.trim()}
                onClick={() => handleConnect(false)}
                className="inline-flex h-10 items-center justify-center rounded-md bg-brand-500 px-4 text-sm font-semibold text-white disabled:opacity-60"
              >
                Connect bot
              </button>
            </div>
          </div>

          {adminMode ? (
            <div className="rounded-md border border-line p-4">
              <h3 className="text-sm font-semibold text-ink">Connect company bot</h3>
              <div className="mt-3 flex flex-col gap-3">
                <input
                  value={companyToken}
                  onChange={(event) => setCompanyToken(event.target.value)}
                  placeholder="Company bot token"
                  className="h-10 rounded-md border border-line px-3 text-sm"
                />
                <input
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  placeholder="Company bot name (optional)"
                  className="h-10 rounded-md border border-line px-3 text-sm"
                />
                <button
                  type="button"
                  disabled={pending || !companyToken.trim()}
                  onClick={() => handleConnect(true)}
                  className="inline-flex h-10 items-center justify-center rounded-md border border-line px-4 text-sm font-semibold text-ink-soft disabled:opacity-60"
                >
                  Connect company bot
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </AdminPanel>
  );

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <AdminPanel>
          <p className="text-sm text-ink-muted">Loading Telegram accounts…</p>
        </AdminPanel>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {error ? <p role="alert" className="rounded-md bg-danger-bg p-3 text-sm text-danger">{error}</p> : null}
      {notice ? <p className="rounded-md bg-success-bg p-3 text-sm text-success">{notice}</p> : null}

      <AdminPanel className="overflow-hidden">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 flex-col gap-1.5">
            <label
              htmlFor="telegram-connection"
              className="text-xs font-semibold uppercase tracking-wider text-ink-subtle"
            >
              Working with
            </label>

            {accounts.length ? (
              <div className="flex flex-wrap items-center gap-3">
                <select
                  id="telegram-connection"
                  value={selectedId ?? ''}
                  onChange={(event) => selectAccount(Number(event.target.value))}
                  className="h-10 w-full max-w-xl rounded-md border border-line bg-surface px-3 text-sm"
                >
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {accountLabel(account)} — {PROVIDER_LABELS[account.provider] || account.provider} ·{' '}
                      {accountStatusLabel(account)}
                    </option>
                  ))}
                </select>

                {selectedAccount ? (
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${accountStatusTone(selectedAccount)}`}
                  >
                    {PROVIDER_LABELS[selectedAccount.provider] || selectedAccount.provider} ·{' '}
                    {accountStatusLabel(selectedAccount)}
                  </span>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-ink-muted">
                No Telegram connection yet. Connect a bot or sign in with your own account.
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => setActiveTab('connections')}
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-md border border-line px-4 text-sm font-semibold text-ink-soft hover:bg-surface-muted"
          >
            Manage connections
          </button>
        </div>
      </AdminPanel>

      <Tabs items={tabs} value={activeTab} onChange={setActiveTab} label="Telegram sections" />

      {activeTab === 'connections' ? (
        <div className="flex flex-col gap-6">
          {adminMode ? botConnectionsPanel : null}
          {showAccountPanel ? <TelegramAccountPanel onChanged={() => loadAccounts(selectedId)} /> : null}
          {!adminMode ? botConnectionsPanel : null}
        </div>
      ) : null}

      {activeTab === 'auto-reply' ? (selectedAccount ? (
        <AdminPanel
          title={`Auto-reply settings: ${accountLabel(selectedAccount)}`}
          description="Welcome, away mode and catalog behaviour for this connection."
        >
          <form onSubmit={handleSettingsSave} className="flex flex-col gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settingsForm.isEnabled}
                onChange={(event) => setSettingsForm((form) => ({ ...form, isEnabled: event.target.checked }))}
              />
              Auto-reply enabled
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settingsForm.awayMode}
                onChange={(event) => setSettingsForm((form) => ({ ...form, awayMode: event.target.checked }))}
              />
              Away mode
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span>Welcome message</span>
              <textarea
                value={settingsForm.welcomeMessage}
                onChange={(event) => setSettingsForm((form) => ({ ...form, welcomeMessage: event.target.value }))}
                rows={3}
                className="rounded-md border border-line p-3 text-sm"
              />
              <span className="text-xs text-ink-subtle">
                Sent the first time somebody writes to this connection. A chat that already
                exists never sees it — use the test message below to send it on demand.
              </span>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span>Away message</span>
              <textarea
                value={settingsForm.awayMessage}
                onChange={(event) => setSettingsForm((form) => ({ ...form, awayMessage: event.target.value }))}
                rows={3}
                className="rounded-md border border-line p-3 text-sm"
              />
              <span className="text-xs text-ink-subtle">
                Sent when the account is away, and only when there is no rule to answer with.
                One per chat per cooldown.
              </span>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span>Away cooldown minutes</span>
                <input
                  type="number"
                  min="0"
                  max="1440"
                  value={settingsForm.awayCooldownMinutes}
                  onChange={(event) => setSettingsForm((form) => ({ ...form, awayCooldownMinutes: Number(event.target.value) }))}
                  className="h-10 rounded-md border border-line px-3 text-sm"
                />
                <span className="text-xs text-ink-subtle">
                  How long the away message waits before it may be sent again in the same chat.
                  {settingsForm.awayCooldownMinutes
                    ? ` That is ${formatCooldown(settingsForm.awayCooldownMinutes)}.`
                    : ''}
                </span>
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settingsForm.catalogEnabled}
                  onChange={(event) => setSettingsForm((form) => ({ ...form, catalogEnabled: event.target.checked }))}
                />
                Send catalog
              </label>
            </div>

            <label className="flex flex-col gap-1 text-sm">
              <span>Catalog intro</span>
              <textarea
                value={settingsForm.catalogIntro}
                onChange={(event) => setSettingsForm((form) => ({ ...form, catalogIntro: event.target.value }))}
                rows={2}
                className="rounded-md border border-line p-3 text-sm"
              />
              <span className="text-xs text-ink-subtle">
                Sent before the catalogue when somebody asks about prices, services or products.
              </span>
            </label>

            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settingsForm.replyToNewChats}
                  onChange={(event) => setSettingsForm((form) => ({ ...form, replyToNewChats: event.target.checked }))}
                />
                Reply to new chats
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settingsForm.replyToReturningChats}
                  onChange={(event) => setSettingsForm((form) => ({ ...form, replyToReturningChats: event.target.checked }))}
                />
                Reply to returning chats
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={pending}
                className="inline-flex h-10 items-center rounded-md bg-brand-500 px-4 text-sm font-semibold text-white disabled:opacity-60"
              >
                Save settings
              </button>
              {selectedAccount.provider !== 'account' ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={handleSync}
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-4 text-sm font-semibold text-ink-soft disabled:opacity-60"
                >
                  <RefreshCw className="size-4" aria-hidden="true" />
                  Sync webhook
                </button>
              ) : null}
              <button
                type="button"
                disabled={pending}
                onClick={handleActiveToggle}
                className="inline-flex h-10 items-center rounded-md border border-line px-4 text-sm font-semibold text-ink-soft disabled:opacity-60"
              >
                {selectedAccount.isActive ? 'Disable auto-reply' : 'Enable auto-reply'}
              </button>
              {selectedAccount.provider === 'custom' ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={handleDisconnect}
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-4 text-sm font-semibold text-danger disabled:opacity-60"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  Disconnect
                </button>
              ) : null}
            </div>

            <div className="rounded-md bg-surface-muted p-3 text-xs text-ink-muted">
              <p>Provider: {PROVIDER_LABELS[selectedAccount.provider] || selectedAccount.provider}</p>
              {selectedAccount.provider === 'account' ? (
                <p>
                  Connection: {selectedAccount.connectionStatus || 'unknown'} — sign in, reconnect or reset this
                  account from the Connections tab.
                </p>
              ) : (
                <>
                  <p>
                    Webhook status: {selectedAccount.webhookStatus || 'unknown'}
                    {selectedAccount.webhookConfigured
                      ? ''
                      : ' — no public URL is configured. Set TELEGRAM_WEBHOOK_URL to the public HTTPS API base and press Sync webhook, or this bot receives nothing.'}
                  </p>
                  <p>
                    A bot receives messages through that webhook. Until it is registered, the bot is
                    listed as active but no message ever reaches it.
                  </p>
                </>
              )}
              {selectedAccount.lastError ? <p className="text-danger">{selectedAccount.lastError}</p> : null}
            </div>

            {/* Check this connection.
                The auto-reply is deliberately quiet: it answers a rule, a
                question about prices, or the away message once per cooldown —
                so "nothing arrived" is usually correct behaviour rather than a
                broken connection. The preview says which of those it would be,
                and the test message proves the connection can send at all. */}
            <div className="rounded-md border border-line p-4">
              <h3 className="text-sm font-semibold text-ink">Check this connection</h3>
              <p className="mt-1 text-xs text-ink-subtle">
                Type a chat id and the message you want to try. The preview runs the same matcher
                the auto-reply uses and tells you what it would answer with — and why it would
                stay quiet.
              </p>

              <div className="mt-3 flex flex-col gap-3">
                <label className="flex flex-col gap-1 text-sm">
                  <span>Chat id</span>
                  <input
                    value={testChatId}
                    onChange={(event) => setTestChatId(event.target.value)}
                    placeholder="e.g. 6487411335"
                    className="h-10 rounded-md border border-line bg-surface px-3 text-sm"
                  />
                  <span className="text-xs text-ink-subtle">
                    Nothing about a chat is kept except its id and a few timestamps, so the id is
                    all there is to work with.
                  </span>
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span>Message to test</span>
                  <input
                    value={previewText}
                    onChange={(event) => setPreviewText(event.target.value)}
                    placeholder="e.g. hi"
                    className="h-10 rounded-md border border-line bg-surface px-3 text-sm"
                  />
                </label>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handlePreview()}
                    disabled={previewLoading}
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm font-medium text-ink-soft hover:bg-surface-muted disabled:opacity-60"
                  >
                    <Eye className="size-4" aria-hidden="true" />
                    {previewLoading ? 'Checking…' : 'Preview what happens'}
                  </button>

                  {preview?.plan?.kind === 'away' && preview?.plan?.away?.blocked ? (
                    <button
                      type="button"
                      onClick={handleResetAway}
                      disabled={pending}
                      className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm font-medium text-ink-soft hover:bg-surface-muted disabled:opacity-60"
                    >
                      <RotateCcw className="size-4" aria-hidden="true" />
                      Let the away message answer now
                    </button>
                  ) : null}
                </div>

                {preview ? <PreviewResult preview={preview} /> : null}

                <label className="flex flex-col gap-1 text-sm">
                  <span>Message</span>
                  <textarea
                    value={testMessage}
                    onChange={(event) => setTestMessage(event.target.value)}
                    rows={2}
                    placeholder="What should it say?"
                    className="rounded-md border border-line p-3 text-sm"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setTestMessage(settingsForm.welcomeMessage || '')}
                      className="rounded-md border border-line px-3 py-1.5 text-xs text-ink-soft hover:bg-surface-muted"
                    >
                      Use welcome message
                    </button>
                    <button
                      type="button"
                      onClick={() => setTestMessage(settingsForm.awayMessage || '')}
                      className="rounded-md border border-line px-3 py-1.5 text-xs text-ink-soft hover:bg-surface-muted"
                    >
                      Use away message
                    </button>
                  </div>
                </label>

                <div>
                  <button
                    type="button"
                    onClick={handleTestMessage}
                    disabled={testSending || !testChatId || !testMessage.trim()}
                    className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-4 text-sm font-semibold text-ink-soft hover:bg-surface-muted disabled:opacity-60"
                  >
                    <Send className="size-4" aria-hidden="true" />
                    {testSending ? 'Sending…' : 'Send test message'}
                  </button>
                </div>
              </div>
            </div>

            {/* The only chat list the admin sees: a chat id and its two
                switches. Nothing about what a client wrote is kept. */}
            <div className="rounded-md border border-line p-4">
              <h3 className="text-sm font-semibold text-ink">Blocked chats</h3>
              <p className="mt-1 text-xs text-ink-subtle">
                A chat here is never answered. Use the chat id — nothing else about a chat is
                stored.
              </p>

              {blockedChats.length ? (
                <ul className="mt-3 flex flex-col gap-2">
                  {blockedChats.map((chat) => (
                    <li
                      key={`${chat.accountId}-${chat.chatId}`}
                      className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2"
                    >
                      <span className="font-mono text-sm text-ink">{chat.chatId}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-xs text-ink-muted">
                          {chat.isBlocked ? 'Blocked' : 'Auto-reply off'}
                        </span>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            handleChatSwitch(chat.chatId, {
                              isBlocked: !chat.isBlocked,
                              autoReplyEnabled: chat.isBlocked ? true : chat.autoReplyEnabled,
                            })
                          }
                          className="rounded-md border border-line px-3 py-1 text-xs text-ink-soft hover:bg-surface-muted disabled:opacity-60"
                        >
                          {chat.isBlocked ? 'Unblock' : 'Allow again'}
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-ink-muted">No chats are blocked.</p>
              )}

              <div className="mt-3 flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1 text-sm">
                  <span>Block a chat id</span>
                  <input
                    value={testChatId}
                    onChange={(event) => setTestChatId(event.target.value)}
                    placeholder="e.g. 6487411335"
                    className="h-10 rounded-md border border-line bg-surface px-3 text-sm"
                  />
                </label>
                <button
                  type="button"
                  disabled={pending || !testChatId}
                  onClick={() => handleChatSwitch(testChatId, { isBlocked: true })}
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-4 text-sm font-semibold text-ink-soft hover:bg-surface-muted disabled:opacity-60"
                >
                  <Ban className="size-4" aria-hidden="true" />
                  Block this chat
                </button>
              </div>
            </div>
          </form>
        </AdminPanel>
      ) : noAccountPanel) : null}

      {activeTab === 'rules' ? (selectedAccount ? (
        <AdminPanel
          title="Reply rules"
          description="Answer each chat differently depending on the trigger. Rules run highest priority first."
        >
          <div className="flex flex-col gap-6">
            <form onSubmit={handleRuleSubmit} className="flex flex-col gap-4 rounded-md border border-line p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-ink">Rule name</span>
                  <input
                    required
                    value={ruleForm.name}
                    onChange={(event) => setRuleForm((form) => ({ ...form, name: event.target.value }))}
                    placeholder="e.g. Price question"
                    className="h-10 rounded-md border border-line px-3 text-sm"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-ink">Trigger</span>
                  <select
                    value={ruleForm.trigger}
                    onChange={(event) => setRuleForm((form) => ({ ...form, trigger: event.target.value }))}
                    className="h-10 rounded-md border border-line bg-surface px-3 text-sm"
                  >
                    {Object.entries(TRIGGER_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {ruleForm.trigger === 'keyword' || ruleForm.trigger === 'exact' || ruleForm.trigger === 'regex' ? (
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-ink">
                    {ruleForm.trigger === 'regex' ? 'Regular expression' : 'Keywords'}
                  </span>
                  <textarea
                    value={ruleForm.keywords}
                    onChange={(event) => setRuleForm((form) => ({ ...form, keywords: event.target.value }))}
                    rows={2}
                    placeholder={
                      ruleForm.trigger === 'regex'
                        ? 'e.g. ^(price|cost)\\b'
                        : 'Separate keywords with commas or new lines'
                    }
                    className="rounded-md border border-line p-3 text-sm"
                  />
                </label>
              ) : null}

              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-ink">Reply text</span>
                <textarea
                  value={ruleForm.replyText}
                  onChange={(event) => setRuleForm((form) => ({ ...form, replyText: event.target.value }))}
                  rows={3}
                  placeholder="What should this account say?"
                  className="rounded-md border border-line p-3 text-sm"
                />
              </label>

              <MultiPhotoField
                label="Image album (optional)"
                value={ruleForm.images}
                onChange={(images) => setRuleForm((form) => ({ ...form, images }))}
                folder="telegram-rules"
                hint="Sent as a photo album right after the reply text when this rule matches."
              />

              {/* The voice note or sound bite, after the text and the album. */}
              <AudioField
                value={ruleForm.audio}
                onChange={(audio) => setRuleForm((form) => ({ ...form, audio }))}
                canUpload={canUploadMedia}
                hint="Sent right after the reply text when this rule matches. An OGG/Opus file is sent as a voice note; anything else as an audio file."
              />

              <div className="grid gap-4 sm:grid-cols-3">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-ink">Cooldown minutes</span>
                  <input
                    type="number"
                    min="0"
                    max="10080"
                    value={ruleForm.cooldownMinutes}
                    onChange={(event) =>
                      setRuleForm((form) => ({ ...form, cooldownMinutes: Number(event.target.value) }))
                    }
                    className="h-10 rounded-md border border-line px-3 text-sm"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-ink">Priority</span>
                  <input
                    type="number"
                    min="-1000"
                    max="1000"
                    value={ruleForm.priority}
                    onChange={(event) =>
                      setRuleForm((form) => ({ ...form, priority: Number(event.target.value) }))
                    }
                    className="h-10 rounded-md border border-line px-3 text-sm"
                  />
                </label>

                <div className="flex flex-col gap-2 pt-6 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={ruleForm.sendCatalog}
                      onChange={(event) =>
                        setRuleForm((form) => ({ ...form, sendCatalog: event.target.checked }))
                      }
                    />
                    Send catalog
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={ruleForm.isActive}
                      onChange={(event) =>
                        setRuleForm((form) => ({ ...form, isActive: event.target.checked }))
                      }
                    />
                    Active
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={ruleForm.stopProcessing}
                      onChange={(event) =>
                        setRuleForm((form) => ({ ...form, stopProcessing: event.target.checked }))
                      }
                    />
                    Stop after match
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={ruleForm.showMenu}
                      onChange={(event) =>
                        setRuleForm((form) => ({ ...form, showMenu: event.target.checked }))
                      }
                    />
                    Show menu after reply
                  </label>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={pending || !ruleForm.name.trim()}
                  className="inline-flex h-10 items-center rounded-md bg-brand-500 px-4 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {editingRuleId ? 'Update rule' : 'Add rule'}
                </button>
                {editingRuleId ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setEditingRuleId(null);
                      setRuleForm(defaultRuleForm());
                    }}
                    className="inline-flex h-10 items-center rounded-md border border-line px-4 text-sm font-semibold text-ink-soft disabled:opacity-60"
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            </form>

            {rulesLoading ? <p className="text-sm text-ink-muted">Loading reply rules…</p> : null}

            {rules.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[44rem] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-subtle">
                      <th className="px-3 py-2">Rule</th>
                      <th className="px-3 py-2">Trigger</th>
                      <th className="px-3 py-2">Match</th>
                      <th className="px-3 py-2">Priority</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map((rule) => (
                      <tr key={rule.id} className="border-b border-line align-top">
                        <td className="px-3 py-3">
                          <div className="font-medium text-ink">{rule.name}</div>
                          <div className="text-xs text-ink-muted">{rule.replyText || 'No reply text'}</div>
                          {rule.audio ? (
                            <div className="mt-1 flex items-center gap-1 text-xs text-brand-700">
                              <Music4 className="size-3" aria-hidden="true" />
                              {rule.audio.mimeType === 'audio/ogg' ? 'Voice note' : 'Audio file'}
                            </div>
                          ) : null}
                          {rule.imageMediaIds?.length ? (
                            <div className="text-xs text-brand-700">{rule.imageMediaIds.length} album image(s)</div>
                          ) : null}
                        </td>
                        <td className="px-3 py-3">{TRIGGER_LABELS[rule.trigger] || rule.trigger}</td>
                        <td className="px-3 py-3 text-xs text-ink-muted">{rule.keywords || '—'}</td>
                        <td className="px-3 py-3">{rule.priority}</td>
                        <td className="px-3 py-3">
                          {rule.isActive ? 'Active' : 'Inactive'}
                          {rule.cooldownMinutes ? ` · ${rule.cooldownMinutes}m cooldown` : ''}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => startRuleEdit(rule)}
                              className="rounded-md border border-line px-3 py-1.5 text-xs"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => handleRuleDelete(rule.id)}
                              className="rounded-md border border-line px-3 py-1.5 text-xs text-danger disabled:opacity-60"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-ink-muted">
                No reply rules yet. Add one to answer specific chats differently.
              </p>
            )}
          </div>
        </AdminPanel>
      ) : noAccountPanel) : null}

      {activeTab === 'menu' ? (selectedAccount ? (
        <div className="flex flex-col gap-6">
          {selectedAccount.provider === 'account' ? (
            <AdminPanel
              title="Personal accounts use a numbered menu"
              description="Telegram only lets bots attach tappable inline keyboards. A personal account sends the same menu as a numbered list, and the chat user replies with the number of their choice."
            >
              <p className="text-sm text-ink-muted">
                Everything below still applies — the catalog, text replies, image albums, links and submenus all work.
                A submenu becomes a second numbered list with a &ldquo;0. &larr; Back&rdquo; option.
              </p>
            </AdminPanel>
          ) : null}

          <AdminPanel
            title="Menu settings"
            description="Choose whether the menu opens automatically for new chats and what it says."
          >
            <form onSubmit={handleSettingsSave} className="flex flex-col gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settingsForm.menuEnabled}
                  onChange={(event) =>
                    setSettingsForm((form) => ({ ...form, menuEnabled: event.target.checked }))
                  }
                />
                Show interactive menu in new chats
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span>Menu title</span>
                <input
                  value={settingsForm.menuTitle}
                  onChange={(event) =>
                    setSettingsForm((form) => ({ ...form, menuTitle: event.target.value }))
                  }
                  maxLength={300}
                  placeholder="What would you like to do?"
                  className="h-10 rounded-md border border-line px-3 text-sm"
                />
              </label>

              <p className="text-xs text-ink-subtle">
                The menu buttons are configured below. Chat users can send /menu at any time to open it, even when
                automatic opening is off.
              </p>

              <button
                type="submit"
                disabled={pending}
                className="inline-flex h-10 w-fit items-center rounded-md bg-brand-500 px-4 text-sm font-semibold text-white disabled:opacity-60"
              >
                Save menu settings
              </button>
            </form>
          </AdminPanel>

          <AdminPanel
            title="Chat menu buttons"
            description="Menu entries for chat users: send the catalog, a text, an image album, open a link or a submenu. Bot accounts show these as tappable buttons; personal accounts show them as a numbered list."
          >
            <TelegramMenuBuilder accountId={selectedId} menuTitle={settingsForm.menuTitle} />
          </AdminPanel>
        </div>
      ) : noAccountPanel) : null}


      {adminMode && activeTab === 'catalog' ? (
        <AdminPanel title="Catalog" description="Items sent to Telegram chats.">
          <div className="flex flex-col gap-6">
            {canWriteCatalog ? (
            <form onSubmit={handleCatalogSubmit} className="grid gap-4 rounded-md border border-line p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm">
                  <span>Name</span>
                  <input name="name" required value={catalogForm.name} onChange={(event) => setCatalogForm((form) => ({ ...form, name: event.target.value }))} className="h-10 rounded-md border border-line px-3 text-sm" />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span>Price</span>
                  <input name="price" value={catalogForm.price} onChange={(event) => setCatalogForm((form) => ({ ...form, price: event.target.value }))} className="h-10 rounded-md border border-line px-3 text-sm" />
                </label>
              </div>

              <label className="flex flex-col gap-1 text-sm">
                <span>Description</span>
                <textarea name="description" value={catalogForm.description} onChange={(event) => setCatalogForm((form) => ({ ...form, description: event.target.value }))} rows={3} className="rounded-md border border-line p-3 text-sm" />
              </label>

              <div className="grid gap-4 sm:grid-cols-3">
                <label className="flex flex-col gap-1 text-sm">
                  <span>Currency</span>
                  <input name="currency" value={catalogForm.currency} onChange={(event) => setCatalogForm((form) => ({ ...form, currency: event.target.value }))} className="h-10 rounded-md border border-line px-3 text-sm" />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span>Display order</span>
                  <input name="displayOrder" type="number" value={catalogForm.displayOrder} onChange={(event) => setCatalogForm((form) => ({ ...form, displayOrder: Number(event.target.value) }))} className="h-10 rounded-md border border-line px-3 text-sm" />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="isActive" checked={catalogForm.isActive} onChange={(event) => setCatalogForm((form) => ({ ...form, isActive: event.target.checked }))} />
                  Active
                </label>
              </div>

              <PhotoField
                key={editingCatalogId ? `edit-${editingCatalogId}` : `new-${catalog.length}`}
                name="imageMediaId"
                label="Image"
                initialMedia={editingCatalogId ? catalog.find((item) => item.id === editingCatalogId)?.image : null}
                folder="telegram-catalog"
                canUpload
              />

              <MultiPhotoField
                label="Image album (optional)"
                value={catalogForm.images}
                onChange={(images) => setCatalogForm((form) => ({ ...form, images }))}
                folder="telegram-catalog"
                hint="With two or more images the item is sent as a Telegram album instead of a single photo. The single image above stays the fallback."
              />

              <div className="flex gap-3">
                <button type="submit" disabled={pending} className="inline-flex h-10 items-center rounded-md bg-brand-500 px-4 text-sm font-semibold text-white disabled:opacity-60">
                  {editingCatalogId ? 'Update item' : 'Add item'}
                </button>
                {editingCatalogId ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCatalogId(null);
                      setCatalogForm({ name: '', description: '', price: '', currency: 'ETB', imageMediaId: '', images: [], isActive: true, displayOrder: 0 });
                    }}
                    className="inline-flex h-10 items-center rounded-md border border-line px-4 text-sm font-semibold text-ink-soft"
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            </form>
            ) : (
              <p className="text-sm text-ink-muted">You can view the catalog but not edit it.</p>
            )}

            {catalogLoading ? <p className="text-sm text-ink-muted">Loading catalog…</p> : null}

            {catalog.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-subtle">
                      <th className="px-3 py-2">Item</th>
                      <th className="px-3 py-2">Price</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catalog.map((item) => (
                      <tr key={item.id} className="border-b border-line">
                        <td className="px-3 py-3">
                          <div className="font-medium text-ink">{item.name}</div>
                          <div className="text-xs text-ink-muted">{item.description || '—'}</div>
                          {item.imageMediaIds?.length ? (
                            <div className="text-xs text-brand-700">{item.imageMediaIds.length} album image(s)</div>
                          ) : null}
                        </td>
                        <td className="px-3 py-3">{item.price ?? '—'} {item.currency}</td>
                        <td className="px-3 py-3">{item.isActive ? 'Active' : 'Inactive'}</td>
                        <td className="px-3 py-3">
                          <div className="flex gap-2">
                            {canWriteCatalog ? (
                              <>
                                <button type="button" onClick={() => startCatalogEdit(item)} className="rounded-md border border-line px-3 py-1.5 text-xs">Edit</button>
                                <button type="button" onClick={() => handleCatalogDelete(item.id)} className="rounded-md border border-line px-3 py-1.5 text-xs text-danger">Delete</button>
                              </>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-ink-muted">No catalog items yet.</p>
            )}
          </div>
        </AdminPanel>
      ) : null}
    </div>
  );
}

export default TelegramAutoReplyPanel;
