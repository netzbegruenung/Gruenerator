/**
 * Pure formatting for office content (docs, boards, sheets, presentations) search
 * hits — kind, label, URL and a readable snippet from the denormalized `content`
 * preview. No DB access, so it stays unit-testable and is shared by the composer
 * office-search endpoint and chat recall.
 */

/**
 * Compact office-content kind used by the frontend composer chips — mirrors the
 * web `subtypeToKind` so a content hit renders with the same icon the document
 * shows as a title item.
 */
export type OfficeKind = 'doc' | 'board' | 'sheet' | 'pres';

export function officeKind(subtype: string | null): OfficeKind {
  if (subtype === 'boards') return 'board';
  if (subtype === 'sheets') return 'sheet';
  if (subtype === 'presentations') return 'pres';
  return 'doc';
}

/** German label per collaborative_documents subtype (recall block/card). */
export function officeKindLabel(subtype: string | null): string {
  if (subtype === 'boards') return 'Board';
  if (subtype === 'presentations') return 'Präsentation';
  if (subtype === 'sheets' || subtype === 'tabelle') return 'Tabelle';
  return 'Dokument';
}

/** Boards live at /boards/<id>; docs/sheets/presentations at /office/<id>. */
export function officeUrl(subtype: string | null, id: string): string {
  return subtype === 'boards' ? `/boards/${id}` : `/office/${id}`;
}

const OFFICE_SNIPPET_CHARS = 200;

/**
 * Short readable snippet from the denormalized `content` preview. Boards store
 * JSON `{board_type, preview:{columns,notes}}`; docs/sheets/presentations store
 * HTML. Returns '' when nothing usable.
 */
export function officeSnippet(subtype: string | null, content: string | null): string {
  if (!content) return '';
  if (subtype === 'boards') {
    try {
      const parsed = JSON.parse(content) as {
        preview?: { columns?: Array<{ name?: string }>; notes?: string[] };
      };
      const cols = parsed.preview?.columns?.map((c) => c.name).filter(Boolean) ?? [];
      const notes = parsed.preview?.notes ?? [];
      return [...cols, ...notes].join(', ').slice(0, OFFICE_SNIPPET_CHARS);
    } catch {
      return '';
    }
  }
  return content
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, OFFICE_SNIPPET_CHARS);
}
