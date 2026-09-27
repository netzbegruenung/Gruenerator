/**
 * Die eine Navigationsangabe von `notebook_quellen` action="read" als
 * Zeichenbereich — geteilt von eigenen und System-Notebooks.
 */
import {
  charRangeOfChunks,
  markedPageRanges,
  outlineSource,
  type ChunkLocator,
} from '../../../services/notebook/notebookSources.js';

import type { DocumentChunkItem } from '../../../services/document-services/DocumentSearchService/types.js';

export type CharRange = { von: number; zeichen?: number | undefined };

export function pickRange(
  args: {
    abschnitt?: CharRange | undefined;
    seite?: number | undefined;
    section?: number | undefined;
    chunks?: { from: number; to: number } | undefined;
  },
  chunkMap: readonly ChunkLocator[],
  chunks: readonly DocumentChunkItem[],
  /** Der gelesene Text — trägt er `## Seite N`-Marken, entscheiden die. */
  text?: string
): CharRange | { error: string } {
  if (args.seite !== undefined && text) {
    const marked = markedPageRanges(text);
    if (marked.length > 0) {
      const hit = marked.filter((r) => r.page === args.seite);
      if (hit.length === 0) {
        const pages = marked.map((r) => r.page);
        return {
          error: `Seite ${args.seite} gibt es nicht (Seiten ${Math.min(...pages)}–${Math.max(...pages)}).`,
        };
      }
      let von = Math.min(...hit.map((r) => r.start));
      let bis = Math.max(...hit.map((r) => r.end));
      while (von < bis && /\s/.test(text[von]!)) von++;
      while (bis > von && /\s/.test(text[bis - 1]!)) bis--;
      return { von, zeichen: Math.max(1, bis - von) };
    }
  }
  if (args.seite !== undefined) {
    const pages = chunkMap.flatMap((c) => (c.pageNumber === null ? [] : [c.pageNumber]));
    if (pages.length === 0) {
      return {
        error:
          'Diese Quelle hat keine Seitenzahlen — lies mit abschnitt{von} (Zeichen) oder chunks{from,to}.',
      };
    }
    return (
      charRangeOfChunks(chunkMap, (c) => c.pageNumber === args.seite) ?? {
        error: `Seite ${args.seite} gibt es nicht (Seiten ${Math.min(...pages)}–${Math.max(...pages)}).`,
      }
    );
  }
  if (args.section !== undefined) {
    const entry = outlineSource(chunks).find((e) => e.sectionIndex === args.section);
    const range = entry
      ? charRangeOfChunks(chunkMap, (c) => c.index >= entry.chunkFrom && c.index <= entry.chunkTo)
      : null;
    return (
      range ?? { error: `section ${args.section} gibt es nicht — die Nummern stehen in outline.` }
    );
  }
  if (args.chunks !== undefined) {
    const { from, to } = args.chunks;
    return (
      charRangeOfChunks(chunkMap, (c) => c.index >= from && c.index <= to) ?? {
        error: `Keine Chunks im Bereich ${from}–${to}.`,
      }
    );
  }
  return args.abschnitt ?? { von: 0 };
}
