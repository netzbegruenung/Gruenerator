import { citationReferenceRegex } from './sourceLinks.js';

/** The fields of a chat citation the appendix reads. Structural, so web's
 *  typed `ChatCitation` and mobile's untyped message metadata both fit. */
export interface ExportCitation {
  id: number;
  title?: string;
  url?: string;
  documentId?: string;
  collectionName?: string;
}

type Citation = ExportCitation;

function escapeMarkdown(text: string): string {
  return text.replace(/[\\*_`~[\]#!()<>|]/g, '\\$&');
}

function linkableUrl(citation: Citation | undefined): string | null {
  const url = citation?.url?.trim();
  return url && /^https?:\/\//i.test(url) && !/[<>\s]/.test(url) ? url : null;
}

/**
 * `[N]` markers become links to their source's URL. A group with an id the
 * answer has no citation for is left alone — it is more likely a year or a
 * literal bracket than a marker.
 */
function linkCitationMarkers(content: string, byId: Map<number, Citation>): string {
  return content.replace(
    citationReferenceRegex(),
    (whole, _label: string | undefined, _linkId: string | undefined, ids: string | undefined) => {
      if (!ids) return whole;
      const numbers = ids.split(',').map((id) => Number(id.trim()));
      if (!numbers.every((id) => byId.has(id))) return whole;
      if (!numbers.some((id) => linkableUrl(byId.get(id)))) return whole;
      return numbers
        .map((id) => {
          const url = linkableUrl(byId.get(id));
          return url ? `[\\[${id}\\]](<${url}>)` : `\\[${id}\\]`;
        })
        .join('');
    }
  );
}

/**
 * The source list, numbered by citation id so every `[N]` in the text finds its
 * entry. Several chunks of one document share an entry (`[2, 4] Titel`) instead
 * of being renumbered — renumbering after deduplication is what shifted every
 * later number away from the text.
 */
function sourcesList(citations: Citation[]): string {
  const groups = new Map<string, { ids: number[]; citation: Citation }>();
  for (const c of [...citations].sort((a, b) => a.id - b.id)) {
    const key = c.documentId || c.url || `id:${c.id}`;
    const group = groups.get(key);
    if (group) {
      if (!group.ids.includes(c.id)) group.ids.push(c.id);
    } else {
      groups.set(key, { ids: [c.id], citation: c });
    }
  }

  const lines = ['', '', '---', '', '## Quellen', ''];
  for (const { ids, citation } of groups.values()) {
    let line = `- **\\[${ids.join(', ')}\\]** ${escapeMarkdown(citation.title || 'Unbekannte Quelle')}`;
    if (citation.collectionName) line += ` (*${escapeMarkdown(citation.collectionName)}*)`;
    const url = linkableUrl(citation);
    if (url) line += `, <${url}>`;
    lines.push(line);
  }
  return lines.join('\n');
}

/** Export markdown for surfaces that leave the chat as a document (editor,
 *  PDF): markers linked to their URL, the source list appended. */
export function withSourcesMarkdown(
  content: string,
  citations: readonly Citation[] | null | undefined
): string {
  const usable = citations?.filter((c) => Number.isInteger(c?.id) && c.id > 0) ?? [];
  if (!usable.length) return content;
  const byId = new Map(usable.map((c) => [c.id, c]));
  return linkCitationMarkers(content, byId) + sourcesList(usable);
}
