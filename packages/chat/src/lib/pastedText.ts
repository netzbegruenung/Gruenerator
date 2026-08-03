/**
 * Rules and identifiers for long text pasted into the web chat composer.
 *
 * A short paste is usually part of the prompt and belongs in the textarea.
 * Larger multi-line material is easier to inspect and safer to treat as
 * reference material, so the composer turns it into a text attachment.
 */
export const PASTED_TEXT_ATTACHMENT_NAME = 'Eingefügter Text.txt';
export const PASTED_TEXT_PREVIEW_PART_NAME = 'gruenerator-pasted-text-preview';

const MIN_PASTED_TEXT_CHARS = 600;
const MIN_MULTILINE_PASTED_TEXT_CHARS = 200;
const MIN_PASTED_TEXT_LINES = 3;

export function shouldCreatePastedTextAttachment(text: string): boolean {
  const normalized = text.replace(/\r\n?/g, '\n').trim();
  if (!normalized) return false;

  if (normalized.length >= MIN_PASTED_TEXT_CHARS) return true;

  const lines = normalized.split('\n').filter((line) => line.trim().length > 0).length;
  return lines >= MIN_PASTED_TEXT_LINES && normalized.length >= MIN_MULTILINE_PASTED_TEXT_CHARS;
}

export function isPastedTextAttachment(name: string, contentType: string | undefined): boolean {
  return name === PASTED_TEXT_ATTACHMENT_NAME && contentType === 'text/plain';
}

export function pastedTextPreview(text: string, maxLength: number = 360): string {
  const normalized = text.replace(/\r\n?/g, '\n').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trimEnd()}…`;
}
