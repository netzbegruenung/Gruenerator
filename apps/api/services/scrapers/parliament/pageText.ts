/**
 * Arbeit an Text mit `## Seite N`-Marken, wie `OcrService` ihn mit
 * `pageMarkers: true` liefert. Protokolle werden über Seiten geschnitten, und
 * die Marke vor jedem Stück ist das, woraus `pagePayload` die Seitenzahl eines
 * Chunks liest.
 */

export interface PageText {
  page: number;
  text: string;
}

const MARKER = /^##\s*Seite\s+(\d+)\s*$/gm;

/** Text vor der ersten Marke fällt weg — bei `pageMarkers: true` gibt es keinen. */
export function splitPages(text: string): PageText[] {
  const pages: PageText[] = [];
  const matches = [...text.matchAll(MARKER)];
  matches.forEach((m, i) => {
    const start = m.index + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    pages.push({ page: Number(m[1]), text: text.slice(start, end).trim() });
  });
  return pages;
}

export function joinPages(pages: readonly PageText[]): string {
  return pages.map((p) => `## Seite ${p.page}\n\n${p.text}`).join('\n\n');
}

/**
 * Seitenmarken eines Auszugs auf die Seiten des Originals umschreiben: ein
 * Landtag schneidet Seite 109–117 heraus, das PDF zählt aber ab 1. Ohne das
 * zitierte das Notebook „Seite 3" eines Protokolls, das Seite 111 meint.
 * `null` lässt den Text, wie er ist.
 */
export function renumberPageMarkers(text: string, originalPages: readonly number[] | null): string {
  if (!originalPages) return text;
  return text.replace(/##\s*Seite\s+(\d+)/g, (marker, n: string) => {
    const page = originalPages[Number(n) - 1];
    return page === undefined ? marker : `## Seite ${page}`;
  });
}
