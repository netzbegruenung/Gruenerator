/**
 * A canvas as plain text for the chat: the reader behind `@doc` mentions and
 * `read_presentation` for canvas decks. Live state comes from Hocuspocus (an
 * open tab's unsaved edits included), `canvas_documents.initial_state` is the
 * fallback — both through `getCurrentDeckState`.
 */

import { stripInlineMarks } from '@gruenerator/contracts';

import { getCanvas } from './canvasRepository.js';
import { getCurrentCanvasState, getCurrentDeckState } from './canvasStateService.js';

/** Fußzeile der Folienlayouts: Datum, Titel, Seitenzahl sind keine Inhalte. */
const FOOTER_TEXT_IDS: ReadonlySet<string> = new Set([
  'folie-datum',
  'folie-seitenzahl',
  'folie-titel',
]);

interface PageLike {
  additionalTexts?: Array<{ id?: unknown; text?: unknown }>;
  layerOrder?: unknown;
  notes?: unknown;
}

/** The page's texts in layer order (back to front), footer and empty texts left out. */
function pageTexts(state: PageLike): string[] {
  const texts = (state.additionalTexts ?? []).filter(
    (t): t is { id: string; text: string } => typeof t.id === 'string' && typeof t.text === 'string'
  );
  const byId = new Map(texts.map((t) => [t.id, t.text]));
  const order = Array.isArray(state.layerOrder)
    ? state.layerOrder.filter((id): id is string => typeof id === 'string')
    : [];
  const ids = [...order.filter((id) => byId.has(id)), ...texts.map((t) => t.id)];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id) || FOOTER_TEXT_IDS.has(id)) continue;
    seen.add(id);
    const text = stripInlineMarks(byId.get(id) ?? '').trim();
    if (text) out.push(text);
  }
  return out;
}

export function formatCanvasPages(pages: PageLike[], title: string, isSlides: boolean): string {
  const noun = isSlides ? 'Folie' : 'Seite';
  const parts = pages.map((page, i) => {
    const lines = [`## ${noun} ${i + 1}`, ...pageTexts(page)];
    const notes = typeof page.notes === 'string' ? page.notes.trim() : '';
    if (notes) lines.push(`Notizen: ${notes}`);
    return lines.join('\n');
  });
  return [`# ${title}`, ...parts].join('\n\n');
}

/** Whether the canvas exists, is not trashed and the user may open it. */
export async function canvasAccessible(id: string, userId: string): Promise<boolean> {
  return (await getCanvas(id, userId)).kind === 'ok';
}

/**
 * The canvas as text, or null when it does not exist or is not the user's to
 * read. Slide decks (`slide-16-9`) read as „Folie N“, everything else as „Seite N“.
 */
export async function loadCanvasAsContext(id: string, userId: string): Promise<string | null> {
  const found = await getCanvas(id, userId);
  if (found.kind !== 'ok') return null;
  const { title, format } = found.canvas;

  const deck = await getCurrentDeckState(id);
  const pages: PageLike[] =
    deck.pages.length > 0
      ? deck.pages.map((p) => p.state as PageLike)
      : [(await getCurrentCanvasState(id)).state as PageLike];
  return formatCanvasPages(pages, title, format === 'slide-16-9');
}
