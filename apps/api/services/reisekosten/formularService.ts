/**
 * The blank official Reisekosten form and its field map.
 *
 * Both live in the private content checkout (`<INTERN_CONTENT_DIR>/reisekosten/`)
 * next to each other: the PDF is the Landesverband's form, the `.map.json` is
 * the measurement of where each value goes on it. The browser fills it — the
 * server only hands it out.
 *
 * Files change only on deploy, so the first successful read per rate key is
 * cached for the lifetime of the process. A failed read is not cached: a
 * Salt rollout that lands later is picked up without a restart.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  reisekostenFormMapSchema,
  type FormularResponse,
  type RateKey,
} from '@gruenerator/contracts';

import { toError } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';
import { internContentRoot } from '../skills/internalPrompts.js';

const log = createLogger('reisekostenFormular');

/** Base name of the form files per rate key (the form's edition). */
const FORM_FILES: Record<RateKey, string> = {
  'de-DE/nrw': 'nrw-2025-07',
};

const cache = new Map<RateKey, FormularResponse>();

/** The form for `rateKey`, or null when it is missing or its map is invalid. */
export async function getFormular(rateKey: RateKey): Promise<FormularResponse | null> {
  const cached = cache.get(rateKey);
  if (cached) return cached;

  const base = resolve(internContentRoot(), 'reisekosten', FORM_FILES[rateKey]);
  const pdfPath = `${base}.pdf`;
  const mapPath = `${base}.map.json`;

  let pdf: Buffer;
  let rawMap: string;
  try {
    [pdf, rawMap] = await Promise.all([readFile(pdfPath), readFile(mapPath, 'utf8')]);
  } catch (error) {
    log.warn(`Reisekosten form missing at ${base}.{pdf,map.json}: ${toError(error).message}`);
    return null;
  }

  let json: unknown;
  try {
    json = JSON.parse(rawMap);
  } catch (error) {
    log.warn(`Reisekosten form map at ${mapPath} is not JSON: ${toError(error).message}`);
    return null;
  }
  const parsed = reisekostenFormMapSchema.safeParse(json);
  if (!parsed.success) {
    log.warn(`Reisekosten form map at ${mapPath} is invalid: ${parsed.error.message}`);
    return null;
  }
  if (parsed.data.rateKey !== rateKey) {
    log.warn(`Reisekosten form map at ${mapPath} is for ${parsed.data.rateKey}, not ${rateKey}`);
    return null;
  }

  const result: FormularResponse = { pdfBase64: pdf.toString('base64'), map: parsed.data };
  cache.set(rateKey, result);
  return result;
}

/** Tests only. */
export function clearFormularCache(): void {
  cache.clear();
}
