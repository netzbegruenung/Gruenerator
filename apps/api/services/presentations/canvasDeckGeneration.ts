/**
 * Presentations as canvas decks (`slide-16-9`), generated from a prompt.
 *
 * The model fills text slots of the CD layouts (`SLIDE_TEXT_SLOTS`); the
 * composer in `@gruenerator/contracts/slides` builds the pages, the server
 * measures the wrapped text and shrinks what still overflows, and the deck is
 * persisted as a seeded canvas. Used by chat, boards and the web AI button.
 */

import {
  MAX_SLIDES,
  SLIDE_TEXT_LAYOUT_IDS,
  SLIDE_TEXT_SLOTS,
  slideSlotsOf,
  composeSlideDeck,
  slideDeckSpecSchema,
  type ComposedSlideDeck,
  type SlideDeckSpec,
} from '@gruenerator/contracts/slides';

import { createLogger } from '../../utils/logger.js';
import { aiObject } from '../ai/generate.js';
import { createCanvas } from '../canvas/canvasRepository.js';
import { seedCanvasPages } from '../canvas/canvasStateService.js';
import { insertCanvasVersion } from '../canvas/canvasVersionRepository.js';

import {
  findSlotOverflows,
  prepareOverflowMeasuring,
  shrinkOverflows,
} from './canvasDeckOverflow.js';

const log = createLogger('canvasDeckGeneration');

export type DeckLocale = 'de-DE' | 'de-AT';

export interface CreatedCanvasDeck {
  documentId: string;
  title: string;
  subtype: 'canvas';
  url: string;
}

function layoutCatalog(): string {
  return SLIDE_TEXT_LAYOUT_IDS.map((id) => {
    const def = SLIDE_TEXT_SLOTS[id];
    const slots = Object.entries(slideSlotsOf(id))
      .map(
        ([name, slot]) =>
          `    - ${name}${slot.required ? '' : ' (optional)'}: ${slot.hint}, höchstens ${slot.maxChars} Zeichen`
      )
      .join('\n');
    return `- "${id}" — ${def.label}: ${def.use}\n${slots}`;
  }).join('\n');
}

const AT_BLOCK = `

ÖSTERREICH: Die Präsentation ist für ein österreichisches Publikum. Schreibe österreichisches Deutsch (z. B. "Nationalrat", "Bundesland", "Gemeinde", "Landesregierung", "Jänner", "heuer"), nenne keine deutschen Institutionen (Bundestag, Bundesländer-Ministerien), wenn der Auftrag nichts anderes sagt.`;

export function deckSystemPrompt(locale: DeckLocale): string {
  return `Du bist ein Präsentations-Assistent für die Grünen. Erstelle einen Foliensatz im Corporate Design: du wählst je Folie ein Layout und füllst dessen Textfelder.

Verfügbare Layouts und ihre Felder:
${layoutCatalog()}

Regeln:
- 5 bis 12 Folien (höchstens ${MAX_SLIDES}); die erste Folie ist eine Titelfolie ("titel" oder "titel-hell"), die letzte darf "danke" sein
- Wähle ein Thema (dunkel oder hell) und bleibe dabei; wechsle nur für Zitatfolien
- Halte die Zeichenbudgets strikt ein — Text darüber läuft aus der Folie. Lieber kürzen als umbrechen
- Stichpunkte statt Fließtext; in Spalten beginnt jeder Punkt mit "• " auf einer eigenen Zeile. Nutze **fett** sparsam
- "notes" sind Sprechernotizen (ausführlicher, darf leer sein)
- Schreibe jede Folie inhaltlich aus. NIEMALS Platzhalter wie "Kernpunkt 1" oder "hier Inhalt einfügen"; was der Auftrag nicht hergibt, lässt du weg
- Erfinde keine Zahlen, Namen, Kontaktdaten oder Quellen. Ein optionales Feld ohne Inhalt lässt du weg
- Enthält der Auftrag recherchierte Quellen (Zeilen der Form "[1] Titel <URL> — Auszug"), nutze deren Fakten und nenne die Quellen auf einer Textfolie am Ende
- Schreibe auf Deutsch mit geschlechtergerechter Sprache (Genderstern *)${locale === 'de-AT' ? AT_BLOCK : ''}`;
}

/** Loose wire schema; `slideDeckSpecSchema` stays the strict gate. */
export function deckToolSchema(): Record<string, unknown> {
  const slotNames = new Set<string>();
  for (const id of SLIDE_TEXT_LAYOUT_IDS) {
    for (const name of Object.keys(SLIDE_TEXT_SLOTS[id].slots)) slotNames.add(name);
  }
  return {
    type: 'object',
    required: ['title', 'slides'],
    properties: {
      title: { type: 'string', description: 'Titel der Präsentation (höchstens 50 Zeichen)' },
      slides: {
        type: 'array',
        minItems: 1,
        maxItems: MAX_SLIDES,
        items: {
          type: 'object',
          required: ['layout', 'slots'],
          properties: {
            layout: { type: 'string', enum: [...SLIDE_TEXT_LAYOUT_IDS] },
            slots: {
              type: 'object',
              description: 'Textfelder des Layouts, Namen laut Layoutliste',
              properties: Object.fromEntries([...slotNames].map((n) => [n, { type: 'string' }])),
            },
            notes: { type: 'string', description: 'Sprechernotizen, darf leer sein' },
          },
        },
      },
    },
  };
}

function describeIssues(error: {
  issues: Array<{ path: PropertyKey[]; message: string }>;
}): string {
  return error.issues
    .slice(0, 8)
    .map((i) => {
      const [first, second, third] = i.path;
      const where =
        first === 'slides' && typeof second === 'number'
          ? `Folie ${second + 1}${third === 'slots' ? `, Feld ${String(i.path[3] ?? '')}` : ''}`
          : i.path.join('.');
      return `${where}: ${i.message}`;
    })
    .join('; ');
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
  const measuring = await prepareOverflowMeasuring(locale);

  const generated = await aiObject({
    lane: 'doc_generation',
    system: deckSystemPrompt(locale),
    prompt,
    toolName: 'create_presentation',
    toolDescription: 'Erzeugt den Foliensatz aus Layouts und Textfeldern.',
    schema: deckToolSchema(),
    validate: (input, attempt, attempts) => {
      const parsed = slideDeckSpecSchema.safeParse(input);
      if (!parsed.success) return { ok: false as const, error: describeIssues(parsed.error) };
      const spec = parsed.data as SlideDeckSpec;
      // The last attempt takes overflow as it is: shrinking below fixes it.
      if (measuring && attempt < attempts) {
        const { pages } = composeSlideDeck(spec, { locale, date });
        const over = findSlotOverflows(pages, spec, locale);
        if (over.length > 0) {
          return {
            ok: false as const,
            error: `Text läuft aus der Folie: ${over
              .slice(0, 6)
              .map((o) => `Folie ${o.slide}, Feld ${o.slot} (${o.lines} Zeilen, zu lang)`)
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
  const deck: ComposedSlideDeck = composeSlideDeck(spec, { locale, date });
  if (measuring) {
    const still = shrinkOverflows(deck.pages, spec, locale);
    if (still.length > 0) {
      log.warn(
        `Deck text still overflows at minimum size: ${still.map((o) => `${o.slide}/${o.slot}`).join(', ')}`
      );
    }
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
