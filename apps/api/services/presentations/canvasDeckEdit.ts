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
  SLIDE_FOOTER_ELEMENT_IDS,
  SLIDE_TEXT_LAYOUT_IDS,
  SLIDE_TEXT_SLOTS,
  slideDeckOperationsSchema,
  slideSlotsOf,
} from '@gruenerator/contracts/slides';

import { createLogger } from '../../utils/logger.js';
import { aiObject } from '../ai/generate.js';
import { checkCanvasWriteAccess, getCanvas } from '../canvas/canvasRepository.js';
import { applyDeckChanges, getCurrentDeckState } from '../canvas/canvasStateService.js';

const log = createLogger('CanvasDeckEdit');

export type CanvasDeckEditOutcome =
  | { status: 'applied'; title: string; summary: string; applied: number; skipped: string[] }
  | { status: 'needs_confirmation'; title: string; summary: string }
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
      const texts = (Array.isArray(state['additionalTexts']) ? state['additionalTexts'] : [])
        .filter((t): t is TextLike => typeof (t as TextLike)?.id === 'string')
        .filter((t) => !FOOTER.has(t.id))
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

function layoutCatalog(): string {
  return SLIDE_TEXT_LAYOUT_IDS.map((id) => {
    const slots = Object.entries(slideSlotsOf(id))
      .map(([name, s]) => `${name}${s.required ? '' : '?'} (≤${s.maxChars})`)
      .join(', ');
    return `- "${id}" (${SLIDE_TEXT_SLOTS[id].label}): ${slots}`;
  }).join('\n');
}

const SYSTEM = `Du bearbeitest einen Foliensatz der Grünen im Corporate Design. Antworte nur mit Operationen.

Operationen:
- edit-slide {slide, operations, notes?}: Texte einer Folie ändern. operations sind
  {kind:"set-text", field:<Element-Id aus der Folienliste>, label:<kurze Beschreibung>, value:<neuer Text>} oder
  {kind:"remove-element", elementId:<Element-Id>}. notes ersetzt die Sprechernotizen.
- add-slide {afterSlide (0 = ganz vorn), slide:{layout, slots, notes?}}: neue Folie im Layout.
- remove-slide {slide}: Folie löschen.
- move-slide {slide, toPosition}.

Regeln:
- Foliennummern beziehen sich IMMER auf die Liste unten, auch wenn vorher eine Folie gelöscht oder eingefügt wird.
- Nur vorhandene Element-Ids; die Fußzeile (Datum, Titel, Seitenzahl) setzt das System.
- Halte die Länge des bisherigen Textes ein, wenn nicht ausdrücklich mehr gewünscht ist — die Textfelder sind fest. Stichpunkte beginnen mit "• " auf eigener Zeile.
- Farben, Lage, Größe und Bilder kannst du hier nicht ändern; lass sie weg.
- Erfinde keine Zahlen, Namen oder Quellen. Deutsch mit Genderstern (*).
- Höchstens ${MAX_SLIDES} Folien.

Layouts für add-slide (Feld? = optional, ≤ Zeichenbudget):
${layoutCatalog()}`;

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
            description: 'Foliennummer, oder bei add-slide das Folienobjekt {layout, slots, notes}',
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

export async function planAndApplyCanvasDeckEdit(opts: {
  canvasId: string;
  userId: string;
  instruction: string;
  /** false: Löschungen werden geplant, aber nicht geschrieben. */
  destructiveAllowed: boolean;
}): Promise<CanvasDeckEditOutcome> {
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
  const locale = deckPages[0]!.configId === 'freeform-at' ? 'de-AT' : 'de-DE';

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
  });
  const summary = result.applied.join('; ');
  if (result.applied.length === 0) {
    return {
      status: 'failed',
      message: `An der Präsentation hat sich nichts geändert: ${result.refused.join(' ') || 'keine passende Folie.'}`,
    };
  }
  if (!opts.destructiveAllowed && operations.some((op) => op.kind === 'remove-slide')) {
    return { status: 'needs_confirmation', title, summary };
  }

  try {
    await applyDeckChanges(
      canvasId,
      result.structural
        ? { seedPages: pages, replacePages: result.pages, newPages: result.pages }
        : { seedPages: pages, pagePatches: result.pagePatches, newPages: result.pages }
    );
  } catch (err) {
    log.error(`writing ${operations.length} op(s) to ${canvasId} failed: ${err}`);
    return {
      status: 'failed',
      message:
        'Die Änderung konnte nicht in die Präsentation geschrieben werden. Versuch es bitte gleich noch einmal.',
    };
  }
  return {
    status: 'applied',
    title,
    summary,
    applied: result.applied.length,
    skipped: result.refused,
  };
}
