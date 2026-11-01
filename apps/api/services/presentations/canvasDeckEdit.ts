/**
 * Chat-Bearbeitung eines Canvas-Foliensatzes ohne offenen Editor: Live-Zustand
 * lesen, Operationen planen, mit `applySlideDeckOperations` anwenden und über
 * `applyDeckChanges` schreiben (Hocuspocus, sonst `initial_state`).
 *
 * Gleiche Ergebnisform wie `planAndApplyPresentationEdit` (Reveal-Decks), damit
 * `edit_presentation` beide Arten gleich behandelt.
 */

import { stripInlineMarks } from '@gruenerator/contracts';
import {
  applySlideDeckOperations,
  type DeckPage,
  MAX_SLIDES,
  type SlideDeckOperation,
  FOLIEN_TYPEN,
  FOLIEN_TYP_IDS,
  folienSlotsOf,
  readFolie,
  slotElementIds,
  SLIDE_FOOTER_ELEMENT_IDS,
  slideDeckOperationsSchema,
} from '@gruenerator/contracts/slides';

import { createLogger } from '../../utils/logger.js';
import { aiObject } from '../ai/generate.js';
import { checkCanvasWriteAccess, getCanvas } from '../canvas/canvasRepository.js';
import { applyDeckChanges, getCurrentDeckState } from '../canvas/canvasStateService.js';

import { prepareOverflowMeasuring, serverMeasureText } from './canvasDeckOverflow.js';

const log = createLogger('CanvasDeckEdit');

export type CanvasDeckEditOutcome =
  | { status: 'applied'; title: string; summary: string; applied: number; skipped: string[] }
  | {
      status: 'needs_confirmation';
      title: string;
      summary: string;
      operations: SlideDeckOperation[];
      basePageIds: string[];
    }
  | { status: 'failed'; message: string };

export type CanvasDeckPlan =
  | {
      status: 'planned';
      title: string;
      summary: string;
      operations: SlideDeckOperation[];
      /** Seiten-Ids, auf deren Reihenfolge sich die Foliennummern der Operationen beziehen. */
      basePageIds: string[];
      needsConfirmation: boolean;
      /** Nur für den direkten Schreibpfad (`planAndApplyCanvasDeckEdit`). */
      result: ReturnType<typeof applySlideDeckOperations>;
      seedPages: Awaited<ReturnType<typeof getCurrentDeckState>>['pages'];
    }
  | { status: 'failed'; message: string };

const FOOTER = new Set<string>(SLIDE_FOOTER_ELEMENT_IDS);

type TextLike = { id: string; text?: unknown };

/** Was das Modell sieht: je Folie die Textelemente mit Id, dazu die Notizen. */
export function describeDeckForEditing(pages: readonly DeckPage[]): string {
  return pages
    .map((page, index) => {
      const state = page.state;
      const locked = new Set(
        Array.isArray(state['lockedLayerIds']) ? (state['lockedLayerIds'] as string[]) : []
      );
      // Dekor je Punkt (Nummern, Marken …) ist kein Slot: das Modell bearbeitet den Punkt, nicht seine Zier.
      const typ = readFolie(state)?.typ;
      const slotIds = new Set<string>(
        typ ? Object.values(folienSlotsOf(typ)).flatMap(slotElementIds) : []
      );
      if (typ === 'text') slotIds.add('folie-spalte-2');
      const isDecoration = (id: string) => !!typ && id.startsWith('folie-') && !slotIds.has(id);
      const texts = (Array.isArray(state['additionalTexts']) ? state['additionalTexts'] : [])
        .filter((t): t is TextLike => typeof (t as TextLike)?.id === 'string')
        .filter((t) => !FOOTER.has(t.id) && !isDecoration(t.id))
        .map((t) => {
          const text = stripInlineMarks(String(t.text ?? '')).replace(/\n/g, ' / ');
          return `  - ${t.id}${locked.has(t.id) ? ' (gesperrt)' : ''}: „${text}"`;
        });
      const notes =
        typeof state['notes'] === 'string' && state['notes'] ? `  Notizen: ${state['notes']}` : '';
      return [`Folie ${index + 1}:`, ...(texts.length ? texts : ['  (kein Text)']), notes]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');
}

function typCatalog(): string {
  return FOLIEN_TYP_IDS.map((id) => {
    const slots = Object.entries(folienSlotsOf(id))
      .map(([name, s]) =>
        s.kind === 'list'
          ? `${name}${s.required ? '' : '?'} (Array von Texten, ${s.minItems}–${s.maxItems} Punkte je ≤${s.maxChars})`
          : `${name}${s.required ? '' : '?'} (≤${s.maxChars})`
      )
      .join(', ');
    return `- "${id}" (${FOLIEN_TYPEN[id].label}): ${slots}`;
  }).join('\n');
}

const SYSTEM = `Du bearbeitest einen Foliensatz der Grünen im Corporate Design. Antworte nur mit Operationen.

Operationen:
- edit-slide {slide, operations, notes?}: Texte einer Folie ändern. operations sind
  {kind:"set-text", field:<Element-Id aus der Folienliste>, label:<kurze Beschreibung>, value:<neuer Text>} oder
  {kind:"remove-element", elementId:<Element-Id>}. notes ersetzt die Sprechernotizen.
- add-slide {afterSlide (0 = ganz vorn), slide:{typ, slots, notes?}}: neue Folie des Typs; sie bekommt den Stil des Decks.
- remove-slide {slide}: Folie löschen.
- move-slide {slide, toPosition}.

Regeln:
- Foliennummern beziehen sich IMMER auf die Liste unten, auch wenn vorher eine Folie gelöscht oder eingefügt wird.
- Nur vorhandene Element-Ids; die Fußzeile (Datum, Titel, Seitenzahl) setzt das System.
- Halte die Länge des bisherigen Textes ein, wenn nicht ausdrücklich mehr gewünscht ist — die Textfelder sind fest. Stichpunkte in Textspalten beginnen mit "• " auf eigener Zeile; die Einträge einer \`liste\` (add-slide) sind reine Texte ohne vorangestellte Aufzählungszeichen.
- Farben, Lage, Größe und Bilder kannst du hier nicht ändern; lass sie weg.
- Erfinde keine Zahlen, Namen oder Quellen. Deutsch mit Genderstern (*).
- Höchstens ${MAX_SLIDES} Folien.

Folientypen für add-slide (Feld? = optional, ≤ Zeichenbudget; Listen als Array von Texten):
${typCatalog()}

Beispiel add-slide: {"kind": "add-slide", "afterSlide": 2, "slide": {"typ": "liste", "slots": {"headline": "Was wir fordern", "punkte": ["Busse im Zehn-Minuten-Takt", "Sichere Radwege an jeder Schule", "Ein Ticket für die ganze Region"]}}}`;

const OPERATIONS_TOOL_SCHEMA: Record<string, unknown> = {
  type: 'object',
  required: ['operations'],
  properties: {
    operations: {
      type: 'array',
      minItems: 1,
      maxItems: 20,
      items: {
        type: 'object',
        required: ['kind'],
        properties: {
          kind: { type: 'string', enum: ['edit-slide', 'add-slide', 'remove-slide', 'move-slide'] },
          slide: {
            description: 'Foliennummer, oder bei add-slide das Folienobjekt {typ, slots, notes}',
          },
          afterSlide: { type: 'integer' },
          toPosition: { type: 'integer' },
          notes: { type: 'string' },
          operations: {
            type: 'array',
            items: {
              type: 'object',
              required: ['kind'],
              properties: {
                kind: { type: 'string', enum: ['set-text', 'remove-element'] },
                field: { type: 'string' },
                label: { type: 'string' },
                value: { type: 'string' },
                elementId: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
};

const localeOf = (pages: readonly DeckPage[]) =>
  pages[0]?.configId === 'freeform-at' || pages[0]?.configId === 'freeform-gj-at'
    ? 'de-AT'
    : 'de-DE';

/** Der Messer für neue und bearbeitete Texte; null ohne Markenschrift. */
async function measureFor(locale: 'de-DE' | 'de-AT') {
  return (await prepareOverflowMeasuring(locale)) ? serverMeasureText(locale) : null;
}

const WRITE_FAILED =
  'Die Änderung konnte nicht in die Präsentation geschrieben werden. Versuch es bitte gleich noch einmal.';

/**
 * Plant die Operationen und wendet sie nur als Trockenlauf an — es wird nichts
 * geschrieben. `needsConfirmation`: die Änderung löscht Folien.
 */
export async function planCanvasDeckEdit(opts: {
  canvasId: string;
  userId: string;
  instruction: string;
}): Promise<CanvasDeckPlan> {
  const { canvasId, userId, instruction } = opts;
  const access = await checkCanvasWriteAccess(canvasId, userId);
  if (access.kind !== 'ok') {
    return {
      status: 'failed',
      message: 'Du hast keine Bearbeitungsrechte für diese Präsentation.',
    };
  }
  const found = await getCanvas(canvasId, userId);
  if (found.kind !== 'ok') {
    return {
      status: 'failed',
      message: 'Ich konnte die Präsentation nicht finden — vielleicht wurde sie gelöscht.',
    };
  }
  const title = found.canvas.title;
  const { pages } = await getCurrentDeckState(canvasId);
  if (pages.length === 0) {
    return {
      status: 'failed',
      message: 'Die Präsentation hat keine Folien, die ich bearbeiten könnte.',
    };
  }
  const deckPages = pages as DeckPage[];
  const locale = localeOf(deckPages);

  const planned = await aiObject({
    lane: 'editor_ops_presentation',
    system: SYSTEM,
    prompt: `Folien von „${title}":\n\n${describeDeckForEditing(deckPages)}\n\nAuftrag: ${instruction}`,
    toolName: 'edit_slide_deck',
    toolDescription: 'Ändert den Foliensatz mit Operationen.',
    schema: OPERATIONS_TOOL_SCHEMA,
    validate: (input) => {
      const parsed = slideDeckOperationsSchema.safeParse(
        (input as { operations?: unknown } | null)?.operations
      );
      if (parsed.success) return { ok: true as const, value: parsed.data };
      return {
        ok: false as const,
        error: parsed.error.issues
          .slice(0, 6)
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; '),
      };
    },
    temperature: 0.2,
    label: 'presentation-canvas-edit',
  });
  if (!planned.ok) {
    log.warn(`planning failed for ${canvasId}: ${planned.error}`);
    return {
      status: 'failed',
      message:
        'Ich konnte daraus keine konkrete Folien-Änderung ableiten. Beschreib bitte genauer, was sich ändern soll.',
    };
  }

  const operations = planned.data;
  const result = applySlideDeckOperations(deckPages, operations, {
    locale,
    date: new Date(),
    title,
    newPageId: () => crypto.randomUUID(),
    measure: await measureFor(locale),
  });
  if (result.applied.length === 0) {
    return {
      status: 'failed',
      message: `An der Präsentation hat sich nichts geändert: ${result.refused.join(' ') || 'keine passende Folie.'}`,
    };
  }
  return {
    status: 'planned',
    title,
    summary: result.applied.join('; '),
    operations,
    basePageIds: deckPages.map((p) => p.id),
    needsConfirmation: operations.some((op) => op.kind === 'remove-slide'),
    result,
    seedPages: pages,
  };
}

async function writeResult(
  canvasId: string,
  plan: Pick<Extract<CanvasDeckPlan, { status: 'planned' }>, 'result' | 'seedPages'>
): Promise<boolean> {
  const { result, seedPages } = plan;
  try {
    await applyDeckChanges(
      canvasId,
      result.structural
        ? { seedPages, replacePages: result.pages, newPages: result.pages }
        : { seedPages, pagePatches: result.pagePatches, newPages: result.pages }
    );
    return true;
  } catch (err) {
    log.error(`writing to ${canvasId} failed: ${err}`);
    return false;
  }
}

/**
 * Wendet bereits geplante (und bestätigte) Operationen auf den aktuellen Stand
 * an und schreibt sie. Weicht die Seitenreihenfolge von `basePageIds` ab,
 * würden die Foliennummern andere Folien treffen — dann `stale`.
 */
export async function applyPlannedCanvasDeckOperations(opts: {
  canvasId: string;
  userId: string;
  operations: SlideDeckOperation[];
  basePageIds: string[];
}): Promise<
  | { status: 'applied'; title: string; summary: string; skipped: string[] }
  | { status: 'stale' | 'failed'; message: string }
> {
  const { canvasId, userId, operations, basePageIds } = opts;
  const access = await checkCanvasWriteAccess(canvasId, userId);
  if (access.kind !== 'ok') {
    return {
      status: 'failed',
      message: 'Du hast keine Bearbeitungsrechte für diese Präsentation.',
    };
  }
  const found = await getCanvas(canvasId, userId);
  if (found.kind !== 'ok') {
    return {
      status: 'failed',
      message: 'Ich konnte die Präsentation nicht finden — vielleicht wurde sie gelöscht.',
    };
  }
  const title = found.canvas.title;
  const { pages } = await getCurrentDeckState(canvasId);
  const deckPages = pages as DeckPage[];
  const sameDeck =
    deckPages.length === basePageIds.length && deckPages.every((p, i) => p.id === basePageIds[i]);
  if (!sameDeck) {
    return {
      status: 'stale',
      message:
        'Die Präsentation wurde inzwischen geändert — bitte stoß die Änderung noch einmal an.',
    };
  }
  const result = applySlideDeckOperations(deckPages, operations, {
    locale: localeOf(deckPages),
    date: new Date(),
    title,
    newPageId: () => crypto.randomUUID(),
    measure: await measureFor(localeOf(deckPages)),
  });
  if (result.applied.length === 0) {
    return {
      status: 'failed',
      message: `An der Präsentation hat sich nichts geändert: ${result.refused.join(' ') || 'keine passende Folie.'}`,
    };
  }
  if (!(await writeResult(canvasId, { result, seedPages: pages }))) {
    return { status: 'failed', message: WRITE_FAILED };
  }
  return { status: 'applied', title, summary: result.applied.join('; '), skipped: result.refused };
}

export async function planAndApplyCanvasDeckEdit(opts: {
  canvasId: string;
  userId: string;
  instruction: string;
  /** false: Löschungen werden geplant, aber nicht geschrieben. */
  destructiveAllowed: boolean;
}): Promise<CanvasDeckEditOutcome> {
  const plan = await planCanvasDeckEdit(opts);
  if (plan.status === 'failed') return plan;
  if (!opts.destructiveAllowed && plan.needsConfirmation) {
    return {
      status: 'needs_confirmation',
      title: plan.title,
      summary: plan.summary,
      operations: plan.operations,
      basePageIds: plan.basePageIds,
    };
  }
  if (!(await writeResult(opts.canvasId, plan))) {
    return { status: 'failed', message: WRITE_FAILED };
  }
  return {
    status: 'applied',
    title: plan.title,
    summary: plan.summary,
    applied: plan.result.applied.length,
    skipped: plan.result.refused,
  };
}
