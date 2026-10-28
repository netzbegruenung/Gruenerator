/**
 * Stufe „plan" des Bundestag-Q&A: aus einer Frage werden DIP-Filter und
 * Suchwörter. Deterministisches zuerst (Drucksachennummern, Wahlperiode), dann
 * ein Modellaufruf für den Rest. Die Stufe wirft nie — fällt das Modell aus,
 * bleiben die deterministischen Filter plus Notiz.
 */
import {
  bundestagDrucksachetypSchema,
  bundestagFilterSchema,
  bundestagUrheberSchema,
  type BundestagFilter,
} from '@gruenerator/contracts';
import { z } from 'zod';

import { createLogger } from '../../../utils/logger.js';
import { aiObject } from '../../ai/generate.js';
import { BARE_DRS_RE, EXPLICIT_DRS_RE } from '../BundestagEnrichedService.js';
import { type DipClient } from '../dip/dipClient.js';

const log = createLogger('BundestagQaPlan');

const CURRENT_WAHLPERIODE = 21;
const MAX_KEYWORDS = 8;

/** Nur `list` wird gebraucht — so lässt sich der Client im Test ersetzen. */
export type PlanDip = Pick<DipClient, 'list'>;

export interface PlanResult {
  filters: BundestagFilter;
  keywords: string[];
  notes: string[];
  /** true nur, wenn die Wahlperiode auf [21] vorbelegt wurde (weder explizit noch erkannt). */
  assumedWahlperiode: boolean;
}

const STOPWORDS = new Set([
  'welche',
  'welcher',
  'welches',
  'welchen',
  'wurde',
  'wurden',
  'werden',
  'worden',
  'wieviel',
  'gegen',
  'zwischen',
  'dieser',
  'diese',
  'dieses',
  'diesen',
  'durch',
  'haben',
  'sollen',
  'sollte',
  'müssen',
  'können',
  'sagen',
  'sagte',
  'gibt',
  'steht',
  'stehen',
  'zeige',
  'bitte',
  'dazu',
  'darüber',
  'bundestag',
  'drucksache',
  'wahlperiode',
]);

/** Ohne Modell (Ref-Pfad): Wörter ab 5 Zeichen, klein, ohne Dubletten und Stoppwörter, höchstens 8. */
export function keywordsFromQuestion(question: string): string[] {
  const words = question.toLowerCase().match(/[\p{L}\p{N}-]+/gu) ?? [];
  const out: string[] = [];
  for (const w of words) {
    if (w.length < 5 || STOPWORDS.has(w) || out.includes(w)) continue;
    out.push(w);
    if (out.length === MAX_KEYWORDS) break;
  }
  return out;
}

const WP_RE = /\b(?:wp|wahlperiode)\s*(\d{1,2})\b/i;

function detectDeterministic(question: string): BundestagFilter {
  const found: BundestagFilter = {};
  const wp = question.match(WP_RE);
  // Nur 1..30 sind Wahlperioden (wie im Contract); „WP 99" ignorieren.
  if (wp && Number(wp[1]) >= 1 && Number(wp[1]) <= 30) found.wahlperiode = [Number(wp[1])];
  const drs = question.match(EXPLICIT_DRS_RE) ?? question.match(BARE_DRS_RE);
  if (drs) {
    found.dokumentnummer = [`${drs[1]}/${drs[2]}`];
    // „Drucksache 20/123" nennt die Wahlperiode schon.
    found.wahlperiode ??= [Number(drs[1])];
  }
  return found;
}

/** Was das Modell liefern darf: die übrigen Filter plus Suchwörter. Unbekannte Enum-Werte fallen weg. */
const modelOutputSchema = z.object({
  keywords: z.array(z.string().min(2).max(60)).min(1).max(MAX_KEYWORDS),
  wahlperiode: z.array(z.number().int().min(1).max(30)).max(3).optional(),
  drucksachetyp: z.array(z.string()).optional(),
  urheber: z.array(z.string()).optional(),
  // Datum nur als String prüfen; ein krummes Datum soll nicht die ganze Antwort kippen.
  datumVon: z.string().optional(),
  datumBis: z.string().optional(),
  deskriptor: z.array(z.string().min(2).max(80)).max(4).optional(),
  titel: bundestagFilterSchema.shape.titel,
});

const MODEL_JSON_SCHEMA = {
  type: 'object',
  properties: {
    keywords: { type: 'array', items: { type: 'string' } },
    wahlperiode: { type: 'array', items: { type: 'integer' } },
    drucksachetyp: { type: 'array', items: { type: 'string' } },
    urheber: { type: 'array', items: { type: 'string' } },
    datumVon: { type: 'string' },
    datumBis: { type: 'string' },
    deskriptor: { type: 'array', items: { type: 'string' } },
    titel: { type: 'string' },
  },
  required: ['keywords'],
};

function keepKnown<T extends string>(values: string[] | undefined, schema: z.ZodType<T>): T[] {
  const out: T[] = [];
  for (const v of values ?? []) {
    const p = schema.safeParse(v);
    if (p.success && !out.includes(p.data)) out.push(p.data);
  }
  return out;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isoDate(value: string | undefined, name: string, notes: string[]): boolean {
  if (!value) return false;
  if (ISO_DATE_RE.test(value)) return true;
  notes.push(`${name} „${value}" ist kein Datum im Format JJJJ-MM-TT und wurde verworfen.`);
  return false;
}

const SYSTEM = `Du übersetzt eine Frage zum Deutschen Bundestag in Suchfilter für die DIP-Datenbank.
Gib nur Filter an, die die Frage wirklich nennt oder klar nahelegt. Lass alles andere weg.
- drucksachetyp, erlaubte Werte: ${bundestagDrucksachetypSchema.options.join(' | ')}
- urheber, erlaubte Werte: ${bundestagUrheberSchema.options.join(' | ')}. „Grüne" bedeutet „Fraktion BÜNDNIS 90/DIE GRÜNEN".
- deskriptor: Deskriptoren sind Thesaurus-Schlagwörter im Singular (z. B. „Wärmepumpe", nicht „Wärmepumpen"). Höchstens 4.
- datumVon / datumBis im Format JJJJ-MM-TT.
- keywords: 3 bis 8 Suchwörter aus der Frage.`;

async function modelFilters(question: string) {
  const res = await aiObject({
    lane: 'bundestag_plan',
    json: true,
    temperature: 0,
    system: SYSTEM,
    prompt: `Frage: ${question}`,
    toolName: 'filter_melden',
    toolDescription: 'Melde Suchfilter und Suchwörter zur Frage.',
    schema: MODEL_JSON_SCHEMA,
    validate: (input) => {
      const p = modelOutputSchema.safeParse(input);
      return p.success
        ? { ok: true, value: p.data }
        : {
            ok: false,
            error: p.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          };
    },
    label: 'bundestag:plan',
  });
  return res.ok ? res.data : null;
}

export async function planFilters({
  question,
  explicit,
  dip,
}: {
  question: string;
  explicit: BundestagFilter;
  dip: PlanDip;
}): Promise<PlanResult> {
  const notes: string[] = [];
  const detected = detectDeterministic(question);
  let keywords = keywordsFromQuestion(question);
  let fromModel: BundestagFilter = {};

  try {
    const out = await modelFilters(question);
    if (out) {
      keywords = out.keywords;
      const drucksachetyp = keepKnown(out.drucksachetyp, bundestagDrucksachetypSchema);
      const urheber = keepKnown(out.urheber, bundestagUrheberSchema);
      fromModel = {
        ...(out.wahlperiode?.length ? { wahlperiode: out.wahlperiode } : {}),
        ...(drucksachetyp.length ? { drucksachetyp } : {}),
        ...(urheber.length ? { urheber } : {}),
        ...(isoDate(out.datumVon, 'datumVon', notes) ? { datumVon: out.datumVon } : {}),
        ...(isoDate(out.datumBis, 'datumBis', notes) ? { datumBis: out.datumBis } : {}),
        ...(out.deskriptor?.length ? { deskriptor: out.deskriptor } : {}),
        ...(out.titel ? { titel: out.titel } : {}),
      };
    } else {
      notes.push('Die Filter wurden ohne Modell nur aus dem Wortlaut der Frage gebildet.');
    }
  } catch (err) {
    log.info(`Modellstufe fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`);
    notes.push('Die Filter wurden ohne Modell nur aus dem Wortlaut der Frage gebildet.');
  }

  // Vorrang: explicit > deterministisch erkannt > Modell.
  // Schlüssel mit Wert undefined dürfen erkannte Filter nicht überschreiben.
  const given = Object.fromEntries(
    Object.entries(explicit).filter(([, v]) => v !== undefined)
  ) as BundestagFilter;
  const filters: BundestagFilter = { ...fromModel, ...detected, ...given };

  // Die Vorbelegung gilt schon fürs Zählen, damit es dieselbe Periode nutzt wie die Suche.
  let assumedWahlperiode = false;
  if (!filters.wahlperiode?.length) {
    filters.wahlperiode = [CURRENT_WAHLPERIODE];
    assumedWahlperiode = true;
    notes.push(`Keine Wahlperiode genannt, angenommen wurde die ${CURRENT_WAHLPERIODE}.`);
  }

  if (filters.deskriptor?.length) {
    const kept: string[] = [];
    for (const d of filters.deskriptor) {
      try {
        const page = await dip.list('vorgang', {
          'f.deskriptor': d,
          ...(filters.wahlperiode?.length ? { 'f.wahlperiode': filters.wahlperiode } : {}),
        });
        if (page.numFound > 0) kept.push(d);
        else notes.push(`Deskriptor „${d}" hat in DIP keine Treffer und wurde verworfen.`);
      } catch {
        // DIP nicht erreichbar: nicht raten, den Deskriptor behalten.
        kept.push(d);
      }
    }
    if (kept.length) filters.deskriptor = kept;
    else delete filters.deskriptor;
  }

  return { filters, keywords, notes, assumedWahlperiode };
}
