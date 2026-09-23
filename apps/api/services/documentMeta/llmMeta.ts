/**
 * Modell-Rückfall für die Kopfdaten eines Dokuments — nur, wo die Heuristik
 * (`headerMeta.ts`) kein datiertes Signal, kein Gremium oder zwei
 * widersprüchliche Beschlussdaten gefunden hat.
 *
 * Das Modell ist hier ein Vorschlag, keine Quelle. Jedes Feld kommt mit einer
 * wörtlichen Belegstelle zurück, und nur was diese Prüfung übersteht, wird
 * gespeichert: der Beleg muss (Leerraum normalisiert) im Text stehen, das
 * Datum muss im Beleg selbst stehen, das Gremium beim Namen. Ein erfundenes
 * Datum sähe im Notebook genauso aus wie ein echtes — deshalb lieber keines.
 */
import { z } from 'zod';

import { createLogger } from '../../utils/logger.js';
import { type aiObject } from '../ai/generate.js';

import {
  DOC_DATE_KINDS,
  canonicalGremium,
  datesIn,
  extractHeaderMeta,
  hasBeschlussConflict,
  normalizeText,
  summarize,
  type DocDate,
  type DocDateKind,
  type DocLocale,
  type HeaderMeta,
} from './headerMeta.js';

const log = createLogger('DocumentMeta');

/** So viel Text sieht das Modell: der Kopf, grosszügiger als die Heuristik. */
export const LLM_INPUT_CHARS = 8000;
const EVIDENCE_MAX_CHARS = 300;

const DATED_KINDS: ReadonlySet<DocDateKind> = new Set(['beschluss', 'stand', 'published']);
const LLM_KINDS = DOC_DATE_KINDS.filter((k) => k !== 'filename');

const llmMetaSchema = z.object({
  dates: z
    .array(
      z.object({
        date: z.string(),
        kind: z.string(),
        evidence: z.string(),
      })
    )
    .default([]),
  gremium: z.object({ name: z.string(), evidence: z.string() }).nullable().default(null),
  docVersion: z.object({ value: z.string(), evidence: z.string() }).nullable().default(null),
});
export type LlmMetaRaw = z.infer<typeof llmMetaSchema>;

/** Locker gehalten — die Strenge sitzt in `llmMetaSchema` und `verifyLlmMeta`. */
const TOOL_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    dates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'JJJJ-MM-TT' },
          kind: { type: 'string', enum: LLM_KINDS },
          evidence: { type: 'string', description: 'wörtliche Textstelle mit dem Datum' },
        },
        required: ['date', 'kind', 'evidence'],
      },
    },
    gremium: {
      type: ['object', 'null'],
      properties: {
        name: { type: 'string' },
        evidence: { type: 'string', description: 'wörtliche Textstelle mit dem Gremium' },
      },
      required: ['name', 'evidence'],
    },
    docVersion: {
      type: ['object', 'null'],
      properties: {
        value: { type: 'string' },
        evidence: { type: 'string' },
      },
      required: ['value', 'evidence'],
    },
  },
  required: ['dates', 'gremium'],
};

const SYSTEM_PROMPT = `Du liest den Anfang eines Dokuments (oft ein Beschluss, Antrag oder Positionspapier einer grünen Partei) und bestimmst seine Kopfdaten.

Gib NUR an, was wörtlich im Text steht. Jede Angabe braucht "evidence": die Textstelle genau so, wie sie im Text steht (höchstens 200 Zeichen, nicht umformulieren, nichts ergänzen). Findest du etwas nicht, lass es weg — ein fehlendes Feld ist richtig, ein geratenes falsch.

Datumsarten (kind):
- beschluss: an diesem Tag hat ein Gremium das Dokument beschlossen
- stand: "Stand"/Fassung des Dokuments
- published: Datum der Veröffentlichung oder Ausfertigung (z. B. "Datum:")
- inkrafttreten: ab wann eine Regel gilt ("tritt … in Kraft") — NICHT das Beschlussdatum
Ein Datum im Fließtext, das ein Ereignis beschreibt, ist keine dieser Arten.

gremium: das beschließende oder herausgebende Gremium (z. B. Bundesvorstand, Länderrat, Landesdelegiertenkonferenz, Bundeskongress), mit dem Namen so, wie er im Text steht.
docVersion: eine Versions- oder Fassungsnummer, falls vorhanden.`;

export function needsLlm(meta: HeaderMeta): boolean {
  return !meta.dates.some((d) => DATED_KINDS.has(d.kind)) || !meta.gremium || meta.conflict;
}

export interface VerifiedLlmMeta {
  dates: DocDate[];
  gremium: string | null;
  gremiumRaw: string | null;
  docVersion: string | null;
}

function occursIn(haystackNorm: string, needle: string): boolean {
  const n = normalizeText(needle);
  return n.length > 0 && n.length <= EVIDENCE_MAX_CHARS && haystackNorm.includes(n);
}

function todayIso(now: Date): string {
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${mm}-${dd}`;
}

/** Streicht jedes Feld, dessen Beleg nicht wörtlich im Text steht. */
export function verifyLlmMeta(
  raw: LlmMetaRaw,
  text: string,
  opts: { locale: DocLocale; now: Date }
): VerifiedLlmMeta {
  const norm = normalizeText(text);
  const today = todayIso(opts.now);

  let gremium: string | null = null;
  let gremiumRaw: string | null = null;
  if (raw.gremium && occursIn(norm, raw.gremium.evidence)) {
    const name = normalizeText(raw.gremium.name);
    const evidence = normalizeText(raw.gremium.evidence);
    if (name && evidence.toLocaleLowerCase('de').includes(name.toLocaleLowerCase('de'))) {
      gremium = canonicalGremium(name, opts.locale) ?? name;
      gremiumRaw = name;
    }
  }

  const dates: DocDate[] = [];
  for (const d of raw.dates) {
    const kind = LLM_KINDS.find((k) => k === d.kind);
    if (!kind) continue;
    if (!occursIn(norm, d.evidence)) continue;
    const precision = datesIn(normalizeText(d.evidence)).find((x) => x.date === d.date)?.precision;
    if (!precision) continue;
    if (kind !== 'inkrafttreten' && d.date > today) continue;
    const evidence = normalizeText(d.evidence);
    const withGremium =
      kind === 'beschluss' && gremiumRaw && evidence.includes(gremiumRaw) ? gremium : null;
    dates.push({
      date: d.date,
      kind,
      precision,
      evidence,
      gremium: withGremium,
      gremiumRaw: withGremium ? gremiumRaw : null,
    });
  }

  let docVersion: string | null = null;
  if (raw.docVersion && occursIn(norm, raw.docVersion.evidence)) {
    const value = raw.docVersion.value.trim();
    if (value && normalizeText(raw.docVersion.evidence).includes(value)) docVersion = value;
  }

  return { dates, gremium, gremiumRaw, docVersion };
}

export function mergeMeta(heuristic: HeaderMeta, llm: VerifiedLlmMeta): HeaderMeta {
  const key = (d: DocDate) => `${d.kind}:${d.date}`;
  const known = new Set(heuristic.dates.map(key));
  const added = llm.dates.filter((d) => !known.has(key(d)));
  const confirmed = llm.dates.filter((d) => known.has(key(d)));

  // Bei zwei Beschlussdaten entscheidet das Modell, welches DAS Datum ist:
  // das bestätigte rückt nach vorn, das andere bleibt in der Liste.
  const pick = heuristic.conflict
    ? llm.dates.find((d) => d.kind === 'beschluss' && known.has(key(d)))
    : null;
  const ordered = pick
    ? [
        ...heuristic.dates.filter((d) => key(d) === key(pick)),
        ...heuristic.dates.filter((d) => key(d) !== key(pick)),
      ]
    : heuristic.dates;
  const dates = [...ordered, ...added];

  const gremiumFromLlm = !heuristic.gremium && llm.gremium ? llm.gremium : null;
  const contributed =
    added.length > 0 || confirmed.length > 0 || gremiumFromLlm !== null || pick != null;
  const heuristicFound = heuristic.dates.length > 0 || heuristic.gremium !== null;

  return summarize(dates, {
    gremium: heuristic.gremium ?? llm.gremium,
    gremiumRaw: heuristic.gremium ? heuristic.gremiumRaw : llm.gremiumRaw,
    docVersion: heuristic.docVersion ?? llm.docVersion,
    source: !contributed ? 'heuristic' : heuristicFound ? 'heuristic+llm' : 'llm',
    conflict: pick ? false : hasBeschlussConflict(dates),
  });
}

export interface DocumentMetaInput {
  text: string;
  filename: string | null;
  locale: string | null;
  /** Einwilligung der Eigentümer*in nach Art. 9 — ohne sie fragt kein Modell. */
  aiAllowed: boolean;
  now?: Date;
}

export async function extractDocumentMeta(
  input: DocumentMetaInput,
  deps: { aiObject: typeof aiObject }
): Promise<HeaderMeta> {
  const now = input.now ?? new Date();
  const locale: DocLocale = input.locale === 'de-AT' ? 'de-AT' : 'de-DE';
  const heuristic = extractHeaderMeta(input.text, { filename: input.filename, locale, now });
  if (!input.aiAllowed || !needsLlm(heuristic) || !input.text.trim()) return heuristic;

  const head = input.text.slice(0, LLM_INPUT_CHARS);
  const result = await deps.aiObject<LlmMetaRaw>({
    lane: 'document_meta_extraction',
    // Hintergrundarbeit ohne Zeitbudget, kurze schematische Ausgabe — die
    // Stufe `trivial` (services/ai/intermediateLanes.ts), wie Thread-Titel.
    pinned: 'trivial',
    system: SYSTEM_PROMPT,
    prompt: `Dateiname: ${input.filename ?? '(keiner)'}\n\nText:\n${head}`,
    toolName: 'dokument_kopfdaten',
    toolDescription: 'Gibt Datum, Datumsart, Gremium und Version mit wörtlichen Belegen zurück.',
    schema: TOOL_SCHEMA,
    validate: (value) => {
      const parsed = llmMetaSchema.safeParse(value);
      return parsed.success
        ? { ok: true, value: parsed.data }
        : { ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') };
    },
    temperature: 0,
    maxOutputTokens: 800,
    label: 'docmeta',
  });
  if (!result.ok) {
    log.warn(`LLM-Rückfall gescheitert: ${result.error}`);
    return heuristic;
  }
  return mergeMeta(heuristic, verifyLlmMeta(result.data, head, { locale, now }));
}
