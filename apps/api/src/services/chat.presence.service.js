/**
 * Who has a chat socket right now.
 *
 * Chat is "online" when a client can receive a WebSocket frame immediately.
 * Push is therefore an out-of-band fallback for recipients who do not have a
 * live socket (app closed, backgrounded, or a proxy that dropped it).
 *
 * This is deliberately in-memory like the rest of the realtime chat layer: a
 * lost socket is lost anyway, and the browser admin has no socket at all.
 */

const counts = new Map();

function key(userId) {
  const id = Number(userId);
  if (!Number.isFinite(id) || id <= 0) return null;
  return id;
}

/** Record a socket that can send right now. */
export function markOnline(userId) {
  const id = key(userId);
  if (!id) return;
  counts.set(id, (counts.get(id) || 0) + 1);
}

/** Record a socket going away. */
export function markOffline(userId) {
  const id = key(userId);
  if (!id) return;
  const current = counts.get(id) || 0;
  if (current <= 1) counts.delete(id);
  else counts.set(id, current - 1);
}

/** True while this user has at least one open chat socket. */
export function isOnline(userId) {
  const id = key(userId);
  return id !== null && (counts.get(id) || 0) > 0;
}

/** Snapshot used by tests and diagnostics. */
export function onlineUserIds() {
  return [...counts.keys()];
}
