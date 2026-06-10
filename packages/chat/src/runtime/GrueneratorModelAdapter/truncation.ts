/**
 * Cap a long attachment-context string at `maxChars`, keeping the head and tail
 * with a "[...gekürzt...]" marker in between. Returns undefined for empty input
 * so callers can omit the field entirely.
 */
export function truncateAttachmentContext(text: string, maxChars: number): string | undefined {
  if (!text) return undefined;
  if (text.length <= maxChars) return text;
  const half = Math.floor((maxChars - 40) / 2);
  return `${text.slice(0, half)}\n\n[...gekürzt...]\n\n${text.slice(-half)}`;
}
