/**
 * Nur echte PDF-Bytes erreichen den OcrService.
 *
 * Archivseiten verlinken nicht immer die Datei: der WordPress Download Manager
 * (gruene-mv.de, #3577) zeigt auf eine Landingpage, deren HTML-Quelltext sonst
 * als Beschlusstext im Index landete. Die Datei steckt dort in
 * `[data-downloadurl]`.
 *
 * Entschieden wird allein an den Magic Bytes: ein `Content-Type:
 * application/pdf` über einer HTML-Fehlerseite ist genau der Fall, der nicht
 * zum OCR darf, und ein falsch etikettiertes echtes PDF soll trotzdem durch.
 *
 * Validatoren (ETag/Last-Modified) und Byte-Hash kommen immer aus der Antwort
 * der Datei, nie aus der Landingpage — die liefert bei jedem Abruf neue Bytes,
 * ein neues `Last-Modified` und einen neuen `refresh`-Token.
 */
import * as cheerio from 'cheerio';

import { ContentExtractor } from './extractors/ContentExtractor.js';

/** Acrobat duldet Vorlauf vor dem Header; die Spezifikation nennt 1024 Bytes. */
const PDF_HEADER_WINDOW = 1024;

export function isPdfBytes(bytes: Uint8Array): boolean {
  return Buffer.from(bytes.subarray(0, PDF_HEADER_WINDOW)).includes('%PDF-');
}

/**
 * Datei-URL einer WPDM-Landingpage: nur `wpdmdl` bleibt, `refresh` und alles
 * andere fällt weg. Fremde Hosts werden nicht verfolgt.
 */
export function resolveDownloadUrl(
  html: string,
  pageUrl: string
): { url: string; title: string | null } | null {
  const $ = cheerio.load(html);
  const raw = $('[data-downloadurl]').first().attr('data-downloadurl');
  if (!raw) return null;

  let parsed: URL;
  try {
    parsed = new URL(raw, pageUrl);
  } catch {
    return null;
  }
  const id = parsed.searchParams.get('wpdmdl');
  if (!id || parsed.origin !== new URL(pageUrl).origin) return null;

  const title = ContentExtractor.normalizeTitle($('h1.entry-title').first().text());
  return {
    url: `${parsed.origin}${parsed.pathname}?wpdmdl=${encodeURIComponent(id)}`,
    title: title || null,
  };
}

export type PdfFetchResult =
  | { kind: 'not_modified' }
  | { kind: 'not_pdf' }
  | { kind: 'pdf'; bytes: Buffer; response: Response; landingTitle: string | null };

/**
 * Lädt ein Dokument des PDF-Archivs. `response` ist die Antwort, aus der der
 * Fingerprint zu bilden ist — bei einer Landingpage die der Datei.
 *
 * Bedingte Header nur für URLs auf `.pdf` und nur für diese URL selbst: sonst
 * können die gespeicherten Validatoren von einer Landingpage stammen (die
 * MV-Punkte vor #3577), und ein 304 der Datei würde den HTML-Punkt einfrieren.
 */
export async function fetchPdfDocument(
  url: string,
  storedHeaders: Record<string, string>,
  fetchUrl: (
    url: string,
    options: { headers: Record<string, string>; acceptStatus: number[] }
  ) => Promise<Response>
): Promise<PdfFetchResult> {
  const headers = /\.pdf$/i.test(new URL(url).pathname) ? storedHeaders : {};
  const response = await fetchUrl(url, { headers, acceptStatus: [304] });
  if (response.status === 304) return { kind: 'not_modified' };

  const bytes = Buffer.from(await response.arrayBuffer());
  if (isPdfBytes(bytes)) return { kind: 'pdf', bytes, response, landingTitle: null };

  const landing = resolveDownloadUrl(bytes.toString('utf8'), response.url || url);
  if (!landing) return { kind: 'not_pdf' };

  // Gespeicherte Validatoren gehören zur Archiv-URL, nie zur Datei dahinter.
  const fileResponse = await fetchUrl(landing.url, { headers: {}, acceptStatus: [304] });
  if (fileResponse.status === 304) return { kind: 'not_modified' };

  const fileBytes = Buffer.from(await fileResponse.arrayBuffer());
  if (!isPdfBytes(fileBytes)) return { kind: 'not_pdf' };
  return { kind: 'pdf', bytes: fileBytes, response: fileResponse, landingTitle: landing.title };
}
