/**
 * Recognise letter parts that are already written in the document.
 *
 * Most people who write a letter type the recipient, a subject and a
 * salutation straight into the document. Making them retype all of that into
 * the export dialog would be busywork, so the dialog is prefilled from the
 * text — as a PROPOSAL: every field stays editable, and nothing is removed
 * from the body unless the user ticks the box for it.
 *
 * Pure and string-only so it unit-tests without a DOM or an editor instance.
 */

/** PLZ + Ort — 5 digits in Germany, 4 in Austria. */
const POSTAL_LINE = /^(?:[0-9]{4,5})\s+\p{L}[\p{L}\s.'-]*$/u;
/** "Musterweg 1", "Hauptstraße 12a", "Am Markt 3-5" */
const STREET_LINE = /^\p{Lu}[\p{L}\s.'-]*\s+\d+\s*[a-zA-Z]?(?:\s*[-–]\s*\d+)?$/u;
const SALUTATION = /^(sehr\s+(geehrte|geehrter|geehrtes)|liebe[rs]?|hallo|guten\s+tag)\b/i;
const CLOSING =
  /^(mit\s+(freundlichen|besten|solidarischen|gr(ü|ue)nen)\s+gr(ü|ue)(ß|ss)en|viele\s+gr(ü|ue)(ß|ss)e|herzliche\s+gr(ü|ue)(ß|ss)e|beste\s+gr(ü|ue)(ß|ss)e|mit\s+gr(ü|ue)(ß|ss)en)/i;
const SUBJECT_PREFIX = /^(betreff|betr\.?|subject)\s*:\s*/i;
const SENDER_PREFIX = /^(absender|von)\s*:\s*/i;
/** Explicit recipient marker, e.g. "An:" or "An" on its own line. */
const RECIPIENT_PREFIX = /^(an|empf(ä|ae)nger)\s*:?\s*$/i;

/** How far into the document we look — letter furniture lives at the edges. */
const HEAD_LINES = 14;
const TAIL_LINES = 8;

export interface DetectedLetterParts {
  recipient?: string;
  subject?: string;
  salutation?: string;
  closing?: string;
  signature?: string;
  /** Line indices (into the trimmed line list) the proposal came from. */
  consumedLines: number[];
}

/** Split into trimmed lines, keeping the index mapping intact. */
function toLines(text: string): string[] {
  return text.replace(/\r\n/g, '\n').split('\n');
}

function isBlank(line: string | undefined): boolean {
  return !line || !line.trim();
}

/**
 * An address block: 2–5 consecutive non-blank lines ending in a postal line.
 * Requiring the postal line is what keeps ordinary prose from matching.
 */
function findAddressBlock(
  lines: string[],
  from: number,
  to: number
): { start: number; end: number } | null {
  for (let i = from; i < to; i++) {
    if (isBlank(lines[i])) continue;
    for (let end = i; end < Math.min(i + 5, to); end++) {
      if (isBlank(lines[end])) break;
      if (POSTAL_LINE.test((lines[end] ?? '').trim()) && end > i) {
        const hasStreet = lines
          .slice(i, end)
          .some((l) => STREET_LINE.test(l.trim()) || /\d/.test(l));
        if (hasStreet) return { start: i, end };
      }
    }
  }
  return null;
}

/**
 * Read a letter proposal out of the document text.
 *
 * The first address block is treated as the RECIPIENT, not the sender: writing
 * the addressee into the document is by far the more common habit, and the
 * sender comes from the profile anyway. A block explicitly marked "Absender:"
 * is skipped instead of being mistaken for the recipient.
 */
export function detectLetterParts(text: string): DetectedLetterParts {
  const lines = toLines(text);
  const head = Math.min(HEAD_LINES, lines.length);
  const consumed: number[] = [];
  const result: DetectedLetterParts = { consumedLines: consumed };

  // Skip an explicitly marked sender block — the letterhead already prints it.
  let searchFrom = 0;
  const senderIdx = lines.slice(0, head).findIndex((l) => SENDER_PREFIX.test(l.trim()));
  if (senderIdx >= 0) {
    const senderBlock = findAddressBlock(lines, senderIdx, head);
    searchFrom = senderBlock ? senderBlock.end + 1 : senderIdx + 1;
  }

  const explicitIdx = lines
    .slice(searchFrom, head)
    .findIndex((l) => RECIPIENT_PREFIX.test(l.trim()));
  if (explicitIdx >= 0) searchFrom += explicitIdx + 1;

  const address = findAddressBlock(lines, searchFrom, head);
  if (address) {
    const block = lines.slice(address.start, address.end + 1).map((l) => l.trim());
    result.recipient = block.join('\n');
    for (let i = address.start; i <= address.end; i++) consumed.push(i);
    if (explicitIdx >= 0) consumed.push(searchFrom - 1);
  }

  // Subject and salutation follow the address, so scan from just after it.
  const afterAddress = address ? address.end + 1 : searchFrom;
  for (let i = afterAddress; i < head; i++) {
    const line = (lines[i] ?? '').trim();
    if (!line) continue;
    if (!result.subject && SUBJECT_PREFIX.test(line)) {
      result.subject = line.replace(SUBJECT_PREFIX, '').trim();
      consumed.push(i);
      continue;
    }
    if (!result.salutation && SALUTATION.test(line)) {
      result.salutation = line;
      consumed.push(i);
      break; // the body starts here
    }
  }

  // Closing + signature at the very end.
  const tailFrom = Math.max(0, lines.length - TAIL_LINES);
  for (let i = tailFrom; i < lines.length; i++) {
    const line = (lines[i] ?? '').trim();
    if (!line) continue;
    if (CLOSING.test(line)) {
      result.closing = line;
      consumed.push(i);
      // The next non-blank line is the signature.
      for (let j = i + 1; j < lines.length; j++) {
        const candidate = (lines[j] ?? '').trim();
        if (!candidate) continue;
        result.signature = candidate;
        consumed.push(j);
        break;
      }
      break;
    }
  }

  consumed.sort((a, b) => a - b);
  return result;
}

/** True when anything was recognised — drives whether the hint is shown. */
export function hasDetectedParts(parts: DetectedLetterParts): boolean {
  return Boolean(
    parts.recipient || parts.subject || parts.salutation || parts.closing || parts.signature
  );
}

/**
 * Remove the recognised lines from the body so they do not appear twice —
 * once in the DIN-5008 fields and once in the flowing text. Opt-in: the dialog
 * offers this as a checkbox rather than doing it silently, because a
 * misdetection would otherwise delete content without asking.
 */
export function stripDetectedLines(text: string, parts: DetectedLetterParts): string {
  if (!parts.consumedLines.length) return text;
  const drop = new Set(parts.consumedLines);
  return toLines(text)
    .filter((_, i) => !drop.has(i))
    .join('\n')
    .replace(/^\n+/, '')
    .replace(/\n{3,}/g, '\n\n');
}
