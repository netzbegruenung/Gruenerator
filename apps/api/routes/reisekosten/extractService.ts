/**
 * Beleg extraction: OCR the uploaded ticket/receipt (Mistral OCR via OcrService),
 * then a small LLM pass turns the markdown into structured fields. AI is only
 * used here for the fuzzy document-understanding — the money math stays in the
 * deterministic engine.
 */
import { type BelegTyp, type ExtractBelegResponse } from '@gruenerator/contracts';
import { generateObject } from 'ai';
import { z } from 'zod';

import { getIntermediateModel } from '../../services/ai/providers.js';
import { ocrService } from '../../services/OcrService/index.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('reisekostenExtract');

const extractionSchema = z.object({
  betrag: z.number().nullable().describe('Gesamtbetrag in Euro als Zahl, z.B. 164.69'),
  datum: z.string().nullable().describe('Belegdatum im Format YYYY-MM-DD, falls erkennbar'),
  von: z.string().nullable().describe('Abfahrtsort / Start, falls erkennbar'),
  nach: z.string().nullable().describe('Zielort, falls erkennbar'),
  businessPackage: z
    .boolean()
    .nullable()
    .describe(
      'Nur bei Hotelrechnungen: true, wenn das Frühstück als "Business-Package" oder "Servicepauschale" ausgewiesen ist; false wenn als "Frühstück" gelistet; sonst null',
    ),
});

const SYSTEM: Record<BelegTyp, string> = {
  bahn: 'Du extrahierst Daten aus einem Bahnticket / einer DB-Rechnung.',
  oepnv: 'Du extrahierst Daten aus einem ÖPNV-Ticket.',
  miete: 'Du extrahierst Daten aus einer Mietwagen-/Carsharing-Rechnung.',
  taxi: 'Du extrahierst Daten aus einer Taxi-Quittung.',
  hotel:
    'Du extrahierst Daten aus einer Hotelrechnung. Achte besonders darauf, ob das Frühstück als "Business-Package"/"Servicepauschale" (businessPackage=true) oder separat als "Frühstück" (businessPackage=false) ausgewiesen ist.',
  sonstiges: 'Du extrahierst Daten aus einem Beleg (z.B. Teilnahmebeitrag, Parkgebühr).',
};

export async function extractBeleg(
  base64: string,
  filename: string,
  mimeType: string,
  belegType: BelegTyp,
): Promise<ExtractBelegResponse> {
  const ocr = await ocrService.extractTextFromBase64(base64, filename, mimeType);
  const rohtext = ocr.text.slice(0, 8000);

  const result = await generateObject({
    model: getIntermediateModel(),
    schema: extractionSchema,
    system: `${SYSTEM[belegType]}
REGELN:
- Extrahiere NUR Werte, die im Text stehen. Erfinde nichts.
- betrag = der zu erstattende Gesamtbetrag als Dezimalzahl (Punkt als Trenner).
- Wenn ein Wert nicht erkennbar ist, gib null zurück.`,
    prompt: `Beleg-Typ: ${belegType}\n\nOCR-Text:\n${rohtext}`,
    temperature: 0.1,
  });

  log.info(`[reisekosten] extracted ${belegType}: betrag=${result.object.betrag ?? 'n/a'}`);

  return {
    type: belegType,
    betrag: result.object.betrag,
    datum: result.object.datum,
    von: result.object.von,
    nach: result.object.nach,
    businessPackage: result.object.businessPackage,
    confidence: ocr.confidence ?? 0.5,
    rohtext,
  };
}
