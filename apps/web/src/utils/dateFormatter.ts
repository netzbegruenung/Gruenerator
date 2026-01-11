/**
 * Format dates in German relative format
 * Examples: "Gerade eben", "Vor 5 Minuten", "Gestern", "12.01.2025"
 */

/**
 * Format a date string to relative German format
 * @param dateString - ISO date string or timestamp
 * @returns Formatted relative date string in German
 */
export function formatRelativeDate(dateString: string | Date): string {
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  // Less than 1 minute
  if (diffSeconds < 60) {
    return 'Gerade eben';
  }

  // Less than 1 hour
  if (diffMinutes < 60) {
    return `Vor ${diffMinutes} ${diffMinutes === 1 ? 'Minute' : 'Minuten'}`;
  }

  // Less than 24 hours
  if (diffHours < 24) {
    return `Vor ${diffHours} ${diffHours === 1 ? 'Stunde' : 'Stunden'}`;
  }

  // Yesterday
  if (diffDays === 1) {
    return 'Gestern';
  }

  // Less than 7 days
  if (diffDays < 7) {
    return `Vor ${diffDays} ${diffDays === 1 ? 'Tag' : 'Tagen'}`;
  }

  // Less than 30 days
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `Vor ${weeks} ${weeks === 1 ? 'Woche' : 'Wochen'}`;
  }

  // Older than 30 days - show date
  return date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

/**
 * Format date for display in cards (shorter format)
 * @param dateString - ISO date string or timestamp
 * @returns Short relative date string
 */
export function formatShortRelativeDate(dateString: string | Date): string {
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 60) {
    return `${diffMinutes}m`;
  }

  if (diffHours < 24) {
    return `${diffHours}h`;
  }

  if (diffDays < 7) {
    return `${diffDays}d`;
  }

  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

/**
 * Format timestamp for auto-save indicator
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Human-readable time string
 */
export function formatAutoSaveTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);

  if (diffSeconds < 10) {
    return 'gerade eben';
  }

  if (diffSeconds < 60) {
    return 'vor wenigen Sekunden';
  }

  if (diffMinutes < 2) {
    return 'vor einer Minute';
  }

  if (diffMinutes < 60) {
    return `vor ${diffMinutes} Minuten`;
  }

  if (diffHours < 2) {
    return 'vor einer Stunde';
  }

  return `vor ${diffHours} Stunden`;
}
