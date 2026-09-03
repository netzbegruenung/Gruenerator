/**
 * What the reading voice gets to see of an assistant reply.
 *
 * Citation markers come in both wire forms (`[cite:12]` persisted, `[3]` or
 * `[3, 4]` streamed) and mean nothing aloud. The pattern is anchored to the
 * brackets on purpose: an earlier version stripped every digit, so "2026"
 * and "3 Millionen" were read as silence.
 */
const CITATION_RE = /\s*\[(?:cite:)?\d+(?:\s*,\s*\d+)*\]/g;
/** A comma that only separated citations, left dangling before the full stop. */
const ORPHAN_COMMA_RE = /(?:\s*,)+(?=\s*[.!?;:])/g;
const LINK_RE = /\[([^\]]+)\]\([^)]*\)/g;
const LIST_MARKER_RE = /^[ \t]*(?:[-*+]|\d+\.)[ \t]+/gm;
const DECORATION_RE = /[#*_`~>|]/g;

export function stripForSpeech(text: string): string {
  return text
    .replace(LINK_RE, '$1')
    .replace(CITATION_RE, '')
    .replace(ORPHAN_COMMA_RE, '')
    .replace(LIST_MARKER_RE, '')
    .replace(DECORATION_RE, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
