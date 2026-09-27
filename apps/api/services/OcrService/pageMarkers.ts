/**
 * Seitenmarken im extrahierten Text: `## Seite N` vor jeder Seite — genau die
 * Form, die `TextChunker/pageMarkerProcessing.ts` liest und in
 * `page_number` je Chunk übersetzt.
 *
 * NUR AUF AUSDRÜCKLICHEN WUNSCH (`pageMarkers: true`). Ohne die Option bleibt
 * die Ausgabe byteweise, wie sie war: die Scraper hashen den extrahierten Text
 * für ihre Unverändert-Prüfung, und ein geänderter Text hieße, jedes PDF im
 * nächsten Nachtlauf neu zu zerlegen und einzubetten. Scanner und Vision
 * zeigen den Text Menschen — dort nicht.
 *
 * Chat-Anhänge tragen die Marken: das Modell braucht die Seite, um „was steht
 * auf Seite 12" zu beantworten und Zitate mit Seite zu belegen, und die Chunks
 * eines grossen Anhangs bekommen darüber ihr `page_number`. Wo derselbe Text
 * Menschen gezeigt wird (Chip-Vorschau), kommt er ohne Marken an
 * (`stripPageMarkers`).
 *
 * Die Nummer ist die echte Seitenzahl im Dokument. Leere oder gescheiterte
 * Seiten bekommen keine Marke, verschieben aber auch nichts: Seite 4 bleibt
 * Seite 4, wenn Seite 3 leer war.
 */

export interface PageMarkerOptions {
  pageMarkers?: boolean;
}

export interface NumberedPageText {
  /** 1-basiert, die Seite im Dokument. */
  page: number;
  text: string;
}

export function joinPagesWithMarkers(pages: readonly NumberedPageText[]): string {
  return pages
    .filter((p) => p.text.trim())
    .map((p) => `## Seite ${p.page}\n\n${p.text.trim()}`)
    .join('\n\n');
}

/** Der Text ohne die Markenzeilen — für Vorschau und Mindestlängen-Prüfung. */
export function stripPageMarkers(text: string): string {
  return removePageMarkerLines(text).trim();
}

/** Wie `stripPageMarkers`, aber sonst zeichengenau — für Zählungen. */
export function removePageMarkerLines(text: string): string {
  return text.replace(/^##[ \t]*Seite[ \t]+\d+[ \t]*(?:\r?\n)*/gm, '');
}

const MARKER_LINE = /^##[ \t]*Seite[ \t]+(\d+)[ \t]*$/gm;

/**
 * Ersetzt den Text einzelner Seiten — alles zwischen `## Seite N` und der
 * nächsten Marke — durch eine andere Fassung. Die Marken selbst bleiben stehen,
 * Seiten ohne Eintrag und Text vor der ersten Marke bleiben unberührt. Eine
 * leere Ersatzfassung lässt die Seite, wie sie war.
 */
export function replaceMarkedPages(
  text: string,
  replacements: ReadonlyMap<number, string>
): string {
  const markers = [...text.matchAll(MARKER_LINE)];
  if (markers.length === 0 || replacements.size === 0) return text;

  let out = text.slice(0, markers[0].index);
  for (const [i, marker] of markers.entries()) {
    const bodyStart = marker.index + marker[0].length;
    const bodyEnd = i + 1 < markers.length ? markers[i + 1].index : text.length;
    const body = text.slice(bodyStart, bodyEnd);
    const replacement = replacements.get(Number(marker[1]))?.trim();
    if (!replacement) {
      out += marker[0] + body;
      continue;
    }
    const separator = i + 1 < markers.length ? '\n\n' : '';
    out += `${marker[0]}\n\n${replacement}${separator}`;
  }
  return out;
}
