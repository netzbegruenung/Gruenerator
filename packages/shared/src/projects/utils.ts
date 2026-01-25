/**
 * Project utility functions
 * Shared between web frontend and mobile app
 */

/**
 * Format video duration as mm:ss
 * @param seconds - Duration in seconds
 * @returns Formatted string like "1:23" or "--:--" if invalid
 */
export function formatDuration(seconds: number | undefined | null): string {
  if (!seconds || !Number.isFinite(seconds)) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format date as relative time in German
 * @param dateString - ISO date string
 * @returns Relative date like "Heute", "Gestern", "vor 3 Tagen", or formatted date
 */
export function formatDate(dateString: string | undefined | null): string {
  if (!dateString) return '';

  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'Heute';
  } else if (diffDays === 1) {
    return 'Gestern';
  } else if (diffDays < 7) {
    return `vor ${diffDays} Tagen`;
  } else {
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }
}

/**
 * Format file size as MB
 * @param bytes - File size in bytes
 * @returns Formatted string like "12.3 MB" or empty string if invalid
 */
export function formatFileSize(bytes: number | undefined | null): string {
  if (!bytes || !Number.isFinite(bytes)) return '';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}
