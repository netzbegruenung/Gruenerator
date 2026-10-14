/**
 * Beleg extraction: classify a ticket/receipt and pull out amount, date and
 * route. AI is only used for the fuzzy document-understanding — the money math
 * stays in the deterministic engine.
 *
 * Two inputs, and the difference is privacy: a text PDF is read in the browser
 * and only its text arrives here (no OCR, the file never leaves the device);
 * scans and photos arrive as a file and go through OcrService first.
 *
 * Neither the text nor the OCR output is ever logged.
 */
import {
  belegKategorieSchema,
  type ExtractBelegBody,
  type ExtractBelegResponse,
} from '@gruenerator/contracts';
import { generateObject } from 'ai';
import { z } from 'zod';

import { getIntermediateModel } from '../../services/ai/providers.js';
import { ocrService } from '../../services/OcrService/index.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('reisekostenExtract');

const MAX_TEXT_CHARS = 8000;

const extractionSchema = z.object({
  kategorie: belegKategorieSchema.describe('Art des Dokuments, siehe KATEGORIEN'),
  betrag: z.number().nullable().describe('Gesamtbetrag in Euro als Zahl, z.B. 164.69'),
  datum: z.string().nullable().describe('Belegdatum im Format YYYY-MM-DD, falls erkennbar'),
  von: z.string().nullable().describe('Abfahrtsort / Start, falls erkennbar'),
  nach: z.string().nullable().describe('Zielort, falls erkennbar'),
  businessPackage: z
    .boolean()
    .nullable()
    .describe(
      'Nur bei Hotelrechnungen: true, wenn das Frühstück als "Business-Package" oder "Servicepauschale" ausgewiesen ist; false wenn als "Frühstück" gelistet; sonst null'
    ),
});

const SYSTEM = `Du ordnest einen Beleg für eine Reisekostenabrechnung ein und extrahierst seine Daten.

KATEGORIEN (Feld "kategorie"):
- db_rechnung: Rechnung der Deutschen Bahn über eine gekaufte Fahrkarte (Überschrift "Rechnung", Rechnungsnummer, ausgewiesene MwSt.).
- db_ticket: die Fahrkarte / das Online-Ticket der Deutschen Bahn selbst (Zugbindung, Auftragsnummer, QR-/Barcode), ohne Rechnungscharakter.
- flexpreis_vergleich: Preisauskunft oder Verbindungsübersicht der Bahn, die nur zeigt, was der Flexpreis gekostet hätte — es wurde nichts gekauft. Dient als Vergleich für Pkw- oder Mietwagenkosten.
- oepnv_ticket: Fahrschein des Nahverkehrs (Bus, Straßenbahn, U-/S-Bahn, Verbundticket), kein Deutschlandticket.
- deutschlandticket: Deutschlandticket bzw. dessen Abo-Rechnung.
- routenplaner: Ausdruck oder Screenshot eines Routenplaners (Google Maps, ADAC o.ä.) mit Start, Ziel und Kilometern — kein Zahlbeleg.
- hotelrechnung: Rechnung eines Hotels oder einer Unterkunft.
- taxiquittung: Quittung oder Rechnung einer Taxifahrt.
- mietwagenrechnung: Rechnung einer Autovermietung oder eines Carsharing-Anbieters.
- vorstandsbeschluss: Protokoll oder Bestätigung eines Vorstandsbeschlusses, der eine Reise oder Ausgabe genehmigt — kein Zahlbeleg.
- parkbeleg: Parkschein oder Parkhausquittung.
- teilnahmebeitrag: Rechnung oder Bestätigung über eine Teilnahme- bzw. Tagungsgebühr.
- sonstiges: alles, was in keine der Kategorien passt.

REGELN:
- Extrahiere NUR Werte, die im Text stehen. Erfinde nichts.
- betrag = der zu erstattende Gesamtbetrag als Dezimalzahl (Punkt als Trenner). Bei flexpreis_vergleich der angegebene Flexpreis; bei routenplaner und vorstandsbeschluss null.
- von/nach nur bei Fahrten (Bahn, ÖPNV, Taxi, Mietwagen, Routenplaner), sonst null.
- businessPackage nur bei hotelrechnung: true, wenn das Frühstück als "Business-Package" oder "Servicepauschale" ausgewiesen ist, false, wenn es als "Frühstück" einzeln gelistet ist, null, wenn kein Frühstück auftaucht. Bei allen anderen Kategorien null.
- Wenn ein Wert nicht erkennbar ist, gib null zurück.`;

async function readText(
  body: ExtractBelegBody
): Promise<{ text: string; quelle: ExtractBelegResponse['quelle'] }> {
  if ('text' in body) return { text: body.text, quelle: 'server-text' };
  const ocr = await ocrService.extractTextFromBase64(body.base64, body.filename, body.mimeType, {
    pageMarkers: true,
  });
  return { text: ocr.text, quelle: 'server-ocr' };
}

export async function extractBeleg(body: ExtractBelegBody): Promise<ExtractBelegResponse> {
  const { text, quelle } = await readText(body);

  const result = await generateObject({
    model: getIntermediateModel('heavy'),
    schema: extractionSchema,
    system: SYSTEM,
    prompt: `Belegtext:\n${text.slice(0, MAX_TEXT_CHARS)}`,
    temperature: 0.1,
  });

  const o = result.object;
  log.info(`[reisekosten] extracted kategorie=${o.kategorie} quelle=${quelle}`);

  return {
    kategorie: o.kategorie,
    betrag: o.betrag,
    datum: o.datum,
    von: o.von,
    nach: o.nach,
    businessPackage: o.kategorie === 'hotelrechnung' ? o.businessPackage : null,
    quelle,
  };
}
