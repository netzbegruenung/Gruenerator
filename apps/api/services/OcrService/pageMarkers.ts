/**
 * Seitenmarken im extrahierten Text: `## Seite N` vor jeder Seite — genau die
 * Form, die `TextChunker/pageMarkerProcessing.ts` liest und in
 * `page_number` je Chunk übersetzt.
 *
 * NUR AUF AUSDRÜCKLICHEN WUNSCH (`pageMarkers: true`). Ohne die Option bleibt
 * die Ausgabe byteweise, wie sie war: die Scraper hashen den extrahierten Text
 * für ihre Unverändert-Prüfung, und ein geänderter Text hieße, jedes PDF im
 * nächsten Nachtlauf neu zu zerlegen und einzubetten. Chat-Anhänge, Scanner
 * und Vision zeigen den Text Menschen oder dem Modell — auch dort nicht.
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
  return text.replace(/^##[ \t]*Seite[ \t]+\d+[ \t]*(?:\r?\n)*/gm, '').trim();
}
