/**
 * Telegram-style "last seen" and timestamp formatting.
 */

export function formatLastSeen(timestampMs) {
  if (!timestampMs) return 'last seen recently';

  const now = new Date();
  const date = new Date(timestampMs);
  const diffMs = now - date;
  const diffMin = diffMs / 60000;

  const sameDay = now.toDateString() === date.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const wasYesterday = yesterday.toDateString() === date.toDateString();

  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (diffMin < 1) return 'last seen just now';
  if (diffMin < 60) return `last seen ${Math.floor(diffMin)} min ago`;
  if (sameDay) return `last seen today at ${timeStr}`;
  if (wasYesterday) return `last seen yesterday at ${timeStr}`;

  const dateStr = date.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
  return `last seen ${dateStr} at ${timeStr}`;
}

// For message bubbles: "14:32" if today, otherwise "12 Jun, 14:32"
export function formatMessageTime(timestampMs) {
  const date = new Date(timestampMs);
  const now = new Date();
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (now.toDateString() === date.toDateString()) {
    return timeStr;
  }
  const dateStr = date.toLocaleDateString([], { day: '2-digit', month: 'short' });
  return `${dateStr}, ${timeStr}`;
}
