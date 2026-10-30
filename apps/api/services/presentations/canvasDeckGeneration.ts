/**
 * Presentations as canvas decks (`slide-16-9`), generated from a prompt.
 *
 * The model picks a Folientyp per slide and fills its slots; the composer in
 * `@gruenerator/contracts/slides` builds the pages in the chosen Vorlage
 * (Stil), the server measures the wrapped text and shrinks what still
 * overflows, and the deck is persisted as a seeded canvas. Used by chat,
 * boards and the web AI button.
 */

import {
  composeSlideDeck,
  deckSpecSchema,
  FOLIEN_TYP_IDS,
  FOLIEN_TYPEN,
  folienSlotsOf,
  MAX_SLIDES,
  type ComposedSlideDeck,
  type DeckSpec,
} from '@gruenerator/contracts/slides';

import { createLogger } from '../../utils/logger.js';
import { aiObject } from '../ai/generate.js';
import { createCanvas } from '../canvas/canvasRepository.js';
import { seedCanvasPages } from '../canvas/canvasStateService.js';
import { insertCanvasVersion } from '../canvas/canvasVersionRepository.js';
import { defaultDeckStil, listFolienVorlagen } from '../sharepicVorlagen/catalog.js';

import { prepareOverflowMeasuring, serverMeasureText } from './canvasDeckOverflow.js';

const log = createLogger('canvasDeckGeneration');

export type DeckLocale = 'de-DE' | 'de-AT';

export interface CreatedCanvasDeck {
  documentId: string;
  title: string;
  subtype: 'canvas';
  url: string;
}

function typCatalog(): string {
  return FOLIEN_TYP_IDS.map((id) => {
    const def = FOLIEN_TYPEN[id];
    const slots = Object.entries(folienSlotsOf(id))
      .map(([name, slot]) =>
        slot.kind === 'list'
          ? `    - ${name}${slot.required ? '' : ' (optional)'}: Array von Texten mit ${slot.minItems} bis ${slot.maxItems} Einträgen, ${slot.hint}, je höchstens ${slot.maxChars} Zeichen`
          : `    - ${name}${slot.required ? '' : ' (optional)'}: ${slot.hint}, höchstens ${slot.maxChars} Zeichen`
      )
      .join('\n');
    return `- "${id}" — ${def.label}: ${def.use}\n${slots}`;
  }).join('\n');
}

function vorlagenList(locale: DeckLocale): string {
  return listFolienVorlagen(locale)
    .map((v) => `${v.id} (${v.titel})`)
    .join(', ');
}

const AT_BLOCK = `

ÖSTERREICH: Die Präsentation ist für ein österreichisches Publikum. Schreibe österreichisches Deutsch (z. B. "Nationalrat", "Bundesland", "Gemeinde", "Landesregierung", "Jänner", "heuer"), nenne keine deutschen Institutionen (Bundestag, Bundesländer-Ministerien), wenn der Auftrag nichts anderes sagt.`;

export function deckSystemPrompt(locale: DeckLocale): string {
  return `Du bist ein Präsentations-Assistent für die Grünen. Erstelle einen Foliensatz im Corporate Design: du wählst je Folie einen Typ und füllst dessen Felder. Wie die Folien aussehen, bestimmt die Vorlage, nicht du.

Verfügbare Folientypen und ihre Felder:
${typCatalog()}

Regeln:
- 5 bis 12 Folien (höchstens ${MAX_SLIDES}); die erste Folie ist eine "titel"-Folie, die letzte darf "danke" sein
- Wähle je Folie den passenden Typ. Für drei bis sechs kurze Punkte nimm \`liste\`, nicht \`text\`.
- \`zahl\` nur mit einer Zahl aus dem Material und ihrer Quelle. Ohne Quelle keine Zahl-Folie.
- Hebe pro Headline, Kernsatz oder Zitat höchstens zwei Wörter mit \`==…==\` hervor.
- \`vorlage\` nur setzen, wenn die Person eine Gestaltung nennt; erlaubte Ids: ${vorlagenList(locale)}.
- Halte die Zeichenbudgets strikt ein — Text darüber läuft aus der Folie. Lieber kürzen als umbrechen
- Einträge einer Liste sind reine Texte ohne vorangestellte Aufzählungszeichen. Das Listenfeld heißt \`punkte\` (Mehrzahl) und ist ein Array, z. B. {"typ": "liste", "slots": {"headline": "Was wir fordern", "punkte": ["Busse im Zehn-Minuten-Takt", "Sichere Radwege an jeder Schule", "Ein Ticket für die ganze Region"]}}
- "notes" sind Sprechernotizen (ausführlicher, darf leer sein)
- Schreibe jede Folie inhaltlich aus. NIEMALS Platzhalter wie "Kernpunkt 1" oder "hier Inhalt einfügen"; was der Auftrag nicht hergibt, lässt du weg
- Erfinde keine Zahlen, Namen, Kontaktdaten oder Quellen. Ein optionales Feld ohne Inhalt lässt du weg
- Enthält der Auftrag recherchierte Quellen (Zeilen der Form "[1] Titel <URL> — Auszug"), nutze deren Fakten und nenne die Quellen auf einer Textfolie am Ende
- Schreibe auf Deutsch mit geschlechtergerechter Sprache (Genderstern *)${locale === 'de-AT' ? AT_BLOCK : ''}`;
}

/** Loose wire schema; `deckSpecSchema` stays the strict gate. */
export function deckToolSchema(): Record<string, unknown> {
  const slotShapes = new Map<string, Record<string, unknown>>();
  for (const id of FOLIEN_TYP_IDS) {
    for (const [name, slot] of Object.entries(folienSlotsOf(id))) {
      const shape: Record<string, unknown> =
        slot.kind === 'list'
          ? {
              type: 'array',
              items: { type: 'string' },
              description: `Array von Texten, ein Eintrag je Punkt (Feldname "${name}")`,
            }
          : { type: 'string' };
      const known = slotShapes.get(name);
      // Dieselbe Bezeichnung mit anderer Art in zwei Typen: dann ohne Typangabe.
      slotShapes.set(name, known && known['type'] !== shape.type ? {} : shape);
    }
  }
  return {
    type: 'object',
    required: ['title', 'slides'],
    properties: {
      title: { type: 'string', description: 'Titel der Präsentation (höchstens 50 Zeichen)' },
      vorlage: {
        type: 'string',
        description: 'Id der Vorlage, nur wenn die Person eine Gestaltung nennt',
      },
      slides: {
        type: 'array',
        minItems: 1,
        maxItems: MAX_SLIDES,
        items: {
          type: 'object',
          required: ['typ', 'slots'],
          properties: {
            typ: { type: 'string', enum: [...FOLIEN_TYP_IDS] },
            slots: {
              type: 'object',
              description: 'Felder des Folientyps, Namen laut Typliste',
              properties: Object.fromEntries(slotShapes),
              additionalProperties: false,
            },
            notes: { type: 'string', description: 'Sprechernotizen, darf leer sein' },
          },
        },
      },
    },
  };
}

/**
 * Modelle erfinden für die Liste gern die Einzahl `punkt` (Live-Test 30.10.).
 * Gemeint ist eindeutig `punkte`; die Einzahl wird umbenannt, bevor das
 * strikte Schema sie als unbekanntes Feld ablehnt.
 */
const SLOT_ALIASES: Readonly<Record<string, string>> = { punkt: 'punkte' };

function withSlotAliases(input: unknown): unknown {
  if (!input || typeof input !== 'object' || !Array.isArray((input as { slides?: unknown }).slides))
    return input;
  const deck = input as { slides: unknown[] };
  const slides = deck.slides.map((slide) => {
    const slots = (slide as { slots?: unknown } | null)?.slots;
    if (!slots || typeof slots !== 'object') return slide;
    const renamed: Record<string, unknown> = { ...(slots as Record<string, unknown>) };
    for (const [alias, name] of Object.entries(SLOT_ALIASES)) {
      if (!(alias in renamed) || name in renamed) continue;
      const value = renamed[alias];
      delete renamed[alias];
      renamed[name] = typeof value === 'string' ? [value] : value;
    }
    return { ...(slide as object), slots: renamed };
  });
  return { ...deck, slides };
}

function describeIssues(
  error: {
    issues: Array<{ path: PropertyKey[]; message: string; code?: string; keys?: string[] }>;
  },
  input: unknown
): string {
  const typOf = (index: number): unknown =>
    (input as { slides?: Array<{ typ?: unknown } | null> } | null)?.slides?.[index]?.typ;
  return error.issues
    .slice(0, 8)
    .map((i) => {
      const [first, second, third] = i.path;
      if (first !== 'slides' || typeof second !== 'number')
        return `${i.path.join('.')}: ${i.message}`;
      const folie = `Folie ${second + 1}`;
      if (third !== 'slots') return `${folie}: ${i.message}`;
      if (i.code === 'unrecognized_keys' && i.keys) {
        const typ = typOf(second);
        const allowed = (FOLIEN_TYP_IDS as readonly unknown[]).includes(typ)
          ? `; erlaubt: ${Object.keys(folienSlotsOf(typ as (typeof FOLIEN_TYP_IDS)[number])).join(', ')}`
          : '';
        return `${folie}, Feld ${i.keys.join(', ')}: unbekanntes Feld${allowed}`;
      }
      return `${folie}, Feld ${String(i.path[3] ?? '')}: ${i.message}`;
    })
    .join('; ');
}

/** `vorlage` des Modells, wenn sie eine Katalog-Id des Landes ist, sonst der Standard des Landes. */
function stilFor(vorlage: string | undefined, locale: DeckLocale) {
  const named = vorlage ? listFolienVorlagen(locale).find((v) => v.id === vorlage) : undefined;
  return named?.stil ?? defaultDeckStil(locale);
}

/**
 * Generates, composes, measures and persists a canvas deck. Returns null when
 * the model produced no usable structure after its repair attempts.
 */
export async function generateCanvasDeck(opts: {
  prompt: string;
  userId: string;
  locale: DeckLocale;
  /** Called once after generation succeeded, right before the DB write. */
  onCommit?: () => void;
  abandoned?: AbortSignal;
}): Promise<CreatedCanvasDeck | null> {
  const { prompt, userId, locale } = opts;
  const date = new Date();
  const measure = (await prepareOverflowMeasuring(locale)) ? serverMeasureText(locale) : null;
  const compose = (spec: DeckSpec) =>
    composeSlideDeck(spec, { locale, date, stil: stilFor(spec.vorlage, locale), measure });

  const generated = await aiObject({
    lane: 'doc_generation',
    system: deckSystemPrompt(locale),
    prompt,
    toolName: 'create_presentation',
    toolDescription: 'Erzeugt den Foliensatz aus Folientypen und ihren Feldern.',
    schema: deckToolSchema(),
    validate: (raw, attempt, attempts) => {
      const input = withSlotAliases(raw);
      const parsed = deckSpecSchema.safeParse(input);
      if (!parsed.success)
        return { ok: false as const, error: describeIssues(parsed.error, input) };
      const spec = parsed.data as DeckSpec;
      // The last attempt takes overflow as it is: the minimum size is the fallback.
      if (measure && attempt < attempts) {
        const { overflow } = compose(spec);
        if (overflow.length > 0) {
          return {
            ok: false as const,
            error: `Text passt auch in kleinster Schrift nicht in die Folie: ${overflow
              .slice(0, 6)
              .map((o) => {
                const [slide, id] = o.split(':');
                return `Folie ${slide}, ${id}`;
              })
              .join('; ')} — kürze diese Felder deutlich.`,
          };
        }
      }
      return { ok: true as const, value: spec };
    },
    temperature: 0.4,
    label: 'presentation-canvas',
  });
  if (!generated.ok) {
    log.warn(`Canvas deck generation failed: ${generated.error}`);
    return null;
  }
  if (opts.abandoned?.aborted) return null;
  opts.onCommit?.();

  const spec = generated.data;
  const deck = compose(spec);
  if (deck.overflow.length > 0) {
    log.warn(`Deck text still overflows at minimum size: ${deck.overflow.join(', ')}`);
  }
  return persistCanvasDeck(userId, spec.title, deck);
}

export async function persistCanvasDeck(
  userId: string,
  title: string,
  deck: ComposedSlideDeck
): Promise<CreatedCanvasDeck> {
  const first = deck.pages[0];
  const initialState: Record<string, unknown> = { ...(first?.state ?? {}), pages: deck.pages };
  const canvas = await createCanvas(userId, {
    title,
    template_type: deck.templateType,
    format: 'slide-16-9',
    initial_state: initialState,
    page_count: deck.pages.length,
  });
  // Authoritative Yjs seed before any studio tab opens.
  await seedCanvasPages(canvas.id, deck.templateType, initialState);
  await insertCanvasVersion({
    canvasId: canvas.id,
    state: initialState,
    summary: 'Aus dem Chat erstellt',
    origin: 'mint',
    userId,
  });
  return {
    documentId: canvas.id,
    title: canvas.title ?? title,
    subtype: 'canvas',
    url: `/studio/canvas/${canvas.id}`,
  };
}
