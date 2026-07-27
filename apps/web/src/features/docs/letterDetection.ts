/**
 * Find the recipient's address in the document text.
 *
 * The export dialog used to propose five more things — Betreff, Anrede,
 * Grußformel, Ort, Unterschrift — and ask the user to confirm each in a form.
 * That was the wrong place for them: they are ordinary letter text, and the
 * document is where text gets written. Only the anschrift has to leave the body,
 * because DIN 5008 puts it at a fixed spot (20/50 mm, 85 × 40 mm) where an
 * envelope window can see it. Everything else stays exactly where it was typed.
 *
 * So the detection now answers one question: which lines are the address that
 * moves into the Anschriftfeld?
 *
 * Pure and string-only so it unit-tests without a DOM or an editor instance.
 */

/** PLZ + Ort — 5 digits in Germany, 4 in Austria. */
const POSTAL_LINE = /^(?:[0-9]{4,5})\s+\p{L}[\p{L}\s.'-]*$/u;
/** "Musterweg 1", "Hauptstraße 12a", "Am Markt 3-5" */
const STREET_LINE = /^\p{Lu}[\p{L}\s.'-]*\s+\d+\s*[a-zA-Z]?(?:\s*[-–]\s*\d+)?$/u;
const SENDER_PREFIX = /^(absender|von)\s*:\s*/i;
/** Explicit recipient marker, e.g. "An:" or "An" on its own line. */
const RECIPIENT_PREFIX = /^(an|empf(ä|ae)nger)\s*:?\s*$/i;

/** How far into the document we look — the anschrift stands at the top. */
const HEAD_LINES = 14;

export interface DetectedRecipient {
  recipient?: string;
  /** Line indices (into the trimmed line list) the address came from. */
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
 * Read the recipient's address out of the document text.
 *
 * The first address block is treated as the RECIPIENT, not the sender: writing
 * the addressee into the document is by far the more common habit, and the
 * sender comes from the letterhead anyway. A block explicitly marked "Absender:"
 * is skipped instead of being mistaken for the recipient.
 */
export function detectRecipient(text: string): DetectedRecipient {
  const lines = toLines(text);
  const head = Math.min(HEAD_LINES, lines.length);
  const consumed: number[] = [];

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
  if (!address) return { consumedLines: consumed };

  for (let i = address.start; i <= address.end; i++) consumed.push(i);
  if (explicitIdx >= 0) consumed.push(searchFrom - 1);
  consumed.sort((a, b) => a - b);

  return {
    recipient: lines
      .slice(address.start, address.end + 1)
      .map((l) => l.trim())
      .join('\n'),
    consumedLines: consumed,
  };
}

/** The bit of a BlockNote block this module needs — kept structural so the
 *  detection unit-tests without an editor. */
interface BlockLike {
  content?: unknown;
}

/**
 * One line per top-level block.
 *
 * This is the single text the prefill AND the removal work on. They used to
 * disagree: the dialog read the blocks while the removal ran on serialised
 * HTML, where a line-based detector matches nothing — so the address ended up
 * both in the Anschriftfeld and in the body. Sharing the line list keeps
 * `consumedLines` usable as block indices.
 *
 * Deliberately NOT recursing into children: a nested list would add lines
 * without adding top-level blocks and break that index alignment. An address
 * block is top-level anyway.
 */
export function blockLines(blocks: readonly BlockLike[]): string[] {
  return blocks.map((block) =>
    Array.isArray(block.content)
      ? block.content
          .map((inline: unknown) =>
            inline && typeof inline === 'object' && 'text' in inline
              ? String(inline.text ?? '')
              : ''
          )
          .join('')
      : ''
  );
}

/** Drop the address lines, so the anschrift does not appear twice. */
export function stripDetectedBlocks<T extends BlockLike>(
  blocks: readonly T[],
  parts: DetectedRecipient
): T[] {
  if (!parts.consumedLines.length) return [...blocks];
  const drop = new Set(parts.consumedLines);
  return blocks.filter((_, i) => !drop.has(i));
}
