import { Users } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Shared chat presentation helpers.
 *
 * The same name always hashes to the same gradient pair, so a person keeps one
 * colour across the list, the thread and the picker.
 */

const AVATAR_GRADIENTS = [
  ['#025298', '#4A86D1'],
  ['#0F7A4D', '#4CBF8B'],
  ['#7A3E9D', '#B07CD6'],
  ['#B87309', '#F9A71B'],
  ['#1769AA', '#62A8E5'],
  ['#B42318', '#E57373'],
];

export function initials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function avatarGradient(name) {
  const hash = [...String(name || '')].reduce(
    (sum, character) => sum + character.charCodeAt(0),
    0,
  );
  const [from, to] = AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
  return { backgroundImage: `linear-gradient(135deg, ${from}, ${to})` };
}

export function ChatAvatar({ name, size = 40, group = false, className }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-2xl font-bold text-white shadow-sm',
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.34),
        ...(group
          ? { backgroundImage: 'linear-gradient(135deg, #1C242E, #3D4A5A)' }
          : avatarGradient(name)),
      }}
      aria-hidden="true"
    >
      {group ? (
        <Users style={{ width: size * 0.46, height: size * 0.46 }} />
      ) : (
        initials(name)
      )}
    </span>
  );
}

export function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isSameDay(a, b) {
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function dayLabel(value) {
  const date = parseDate(value);
  if (!date) return '';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = Math.round((today - day) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: day.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
}

/** Time for the conversation list: clock today, "Yesterday", then a date. */
export function listTimeLabel(value) {
  const date = parseDate(value);
  if (!date) return '';
  const now = new Date();
  if (isSameDay(date, now)) {
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, yesterday)) return 'Yesterday';
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
}

export function clockLabel(value) {
  const date = parseDate(value);
  if (!date) return '';
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}
