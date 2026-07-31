/**
 * The model behind a message's document menu.
 *
 * Split out from `MessageActions` for the same reason mobile's `menuActions.ts`
 * exists: what can actually be wrong here is which entries are offered, under
 * which conditions, and what they are called — not the markup around them.
 * Rendering a Radix menu in jsdom to read four labels back would test the menu
 * library.
 */

/** Identifiers, not labels — the component maps these to icons and handlers. */
export type DocumentActionId = 'docs' | 'docx' | 'pdf' | 'pdf-letterhead';

export interface DocumentActionDescriptor {
  id: DocumentActionId;
  label: string;
}

export interface DocumentActionOptions {
  /** A doc was already created from this message — reopen it instead. */
  hasLinkedDoc: boolean;
  /**
   * The host injected `onExportPdfLetterhead`. Without it there is no dialog to
   * choose an Absender in, so the entry is not offered at all rather than
   * offered and broken.
   */
  canExportPdfLetterhead: boolean;
}

export function buildDocumentActions({
  hasLinkedDoc,
  canExportPdfLetterhead,
}: DocumentActionOptions): DocumentActionDescriptor[] {
  return [
    { id: 'docs', label: hasLinkedDoc ? 'Im Editor öffnen' : 'Im Editor bearbeiten' },
    { id: 'docx', label: 'Als Word (.docx)' },
    { id: 'pdf', label: 'Als PDF' },
    ...(canExportPdfLetterhead
      ? [{ id: 'pdf-letterhead' as const, label: 'Als PDF mit Briefkopf …' }]
      : []),
  ];
}

/**
 * Title for the PDF export — the message's first heading, else its opening
 * sentence. The PDF renderer drops a first block that repeats the title
 * (`dropRepeatedHeadline`), so a message starting with that heading does not
 * print it twice.
 */
export function messageTitle(content: string): string {
  const heading = content.match(/^\s{0,3}#{1,6}\s+(.+)$/m)?.[1];
  // No leading `\s*` before the class: `\s` is already in it, and the two
  // overlapping made the match backtrack on long runs of whitespace (CodeQL
  // 1417).
  const source = heading ?? content.replace(/^[#>\-*\d.\s]+/, '');
  const text = source
    .replace(/[*_`~[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const firstSentence = text.split(/(?<=[.!?])\s/)[0] ?? text;
  return firstSentence.slice(0, 60).trim() || 'Chat-Nachricht';
}

/**
 * The backend sends both an ASCII `filename="…"` and the RFC 5987
 * `filename*=UTF-8''…`. Prefer the latter — the ASCII fallback replaces every
 * Umlaut with `_`, so reading only it turned "Bedeutung für Grüne" into
 * "Bedeutung f_r Gr_ne".
 */
export function filenameFromDisposition(header: string | null, extension: string): string {
  const encoded = header?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      /* fall through to the ASCII form */
    }
  }
  return header?.match(/filename="([^"]+)"/)?.[1] || `chat-nachricht.${extension}`;
}
