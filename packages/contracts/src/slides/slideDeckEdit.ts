/**
 * Bearbeiten eines Canvas-Foliensatzes im Chat, ohne offenen Editor.
 *
 * Das Vokabular ist das des Canvas-Kerns (`set-text`, `remove-element` aus
 * `@ggraphic/schema`), je Folie verpackt; neue Folien baut derselbe Composer
 * wie beim Erstellen. Folien-Nummern beziehen sich immer auf den Stand, den
 * das Modell gesehen hat — sie werden vor der ersten Operation auf Seiten-Ids
 * aufgelöst, damit eine Löschung die Nummern der folgenden Operationen nicht
 * verschiebt.
 *
 * Optische Änderungen (Farben, Lage, Größe) gehören dem Editor: dort wendet
 * der Canvas-Chat die vollen Kern-Operationen auf den Store an.
 */

import { removeElementOperation, setTextOperation } from '@ggraphic/schema';
import { z } from 'zod';

import { type BrandLocale } from '../brand/grueneBrand.js';
import { stripInlineMarks } from '../text/inlineMarks.js';

import { buildFolie, deckStilBoxes, type DeckStilId } from './deckStile/index.js';
import { fitSlideTexts, type MeasureText } from './fitText.js';
import { type FolieSpec, folieSpecSchema } from './folienTypen.js';
import { readDeckStil, readFolie } from './slideDeck.js';
import { MAX_SLIDES, unescapeLineBreaks } from './slideDeckBasics.js';
import { slideLayoutConfigId } from './slideLayouts.js';

/** Die Fußzeile setzt der Composer; das Modell schreibt sie nicht. */
export const SLIDE_FOOTER_ELEMENT_IDS = ['folie-datum', 'folie-titel', 'folie-seitenzahl'] as const;

const slideNumber = z.number().int().min(1).max(MAX_SLIDES);

export const slideDeckOperationSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('edit-slide'),
    slide: slideNumber,
    operations: z
      .array(z.discriminatedUnion('kind', [setTextOperation, removeElementOperation]))
      .max(12),
    /** Neue Sprechernotizen; fehlt das Feld, bleiben die alten. */
    notes: z.string().max(2000).nullish(),
  }),
  z.object({
    kind: z.literal('add-slide'),
    /** Einfügen hinter dieser Folie; 0 = ganz vorn. */
    afterSlide: z.number().int().min(0).max(MAX_SLIDES),
    slide: folieSpecSchema,
  }),
  z.object({ kind: z.literal('remove-slide'), slide: slideNumber }),
  z.object({ kind: z.literal('move-slide'), slide: slideNumber, toPosition: slideNumber }),
]);
export type SlideDeckOperation = z.infer<typeof slideDeckOperationSchema>;

export const slideDeckOperationsSchema = z.array(slideDeckOperationSchema).min(1).max(20);

/** Eine Seite, wie sie im Canvas liegt (Live-Zustand oder `initial_state`). */
export interface DeckPage {
  id: string;
  configId: string;
  state: Record<string, unknown>;
}

export interface SlideDeckEditContext {
  locale: BrandLocale;
  date: Date;
  /** Titel in der Fußzeile neuer Folien. */
  title: string;
  newPageId: () => string;
  /** Mit Messer werden neue und bearbeitete Texte in ihre Box eingepasst (`fitSlideTexts`). */
  measure?: MeasureText | null;
}

export interface SlideDeckEditResult {
  /** Der Foliensatz nach allen angewandten Operationen. */
  pages: DeckPage[];
  /** Hat sich Anzahl oder Reihenfolge geändert, ersetzt `pages` den Satz. */
  structural: boolean;
  /** Nur Textänderungen: je geänderte Seite die geänderten Schlüssel. */
  pagePatches: Array<{ pageId: string; patch: Record<string, unknown> }>;
  applied: string[];
  refused: string[];
}

type TextLike = { id: string; text: string };
export const ELEMENT_COLLECTIONS = [
  'additionalTexts',
  'shapeInstances',
  'assetInstances',
  'chartInstances',
  'userImageInstances',
  'pillBadgeInstances',
  'circleBadgeInstances',
] as const;
const FOOTER = new Set<string>(SLIDE_FOOTER_ELEMENT_IDS);

function listOf<T>(state: Record<string, unknown>, key: string): T[] {
  const value = state[key];
  return Array.isArray(value) ? (value as T[]) : [];
}

function setText(state: Record<string, unknown>, elementId: string, raw: string): string | null {
  const value = unescapeLineBreaks(raw);
  if (FOOTER.has(elementId)) return `„${elementId}" ist die Fußzeile und wird automatisch gesetzt`;
  const texts = listOf<TextLike>(state, 'additionalTexts');
  const index = texts.findIndex((t) => t.id === elementId);
  if (index < 0) return `kein Textelement „${elementId}" auf dieser Folie`;
  if (stripInlineMarks(value).trim() === '')
    return `leerer Text für „${elementId}" — zum Entfernen remove-element`;
  state['additionalTexts'] = texts.map((t, i) => (i === index ? { ...t, text: value.trim() } : t));
  return null;
}

function removeElement(state: Record<string, unknown>, elementId: string): string | null {
  if (FOOTER.has(elementId)) return `„${elementId}" ist die Fußzeile und bleibt stehen`;
  if (listOf<string>(state, 'lockedLayerIds').includes(elementId)) {
    return `„${elementId}" ist gesperrt`;
  }
  let found = false;
  for (const key of ELEMENT_COLLECTIONS) {
    const items = listOf<{ id: string }>(state, key);
    const kept = items.filter((e) => e.id !== elementId);
    if (kept.length !== items.length) {
      state[key] = kept;
      found = true;
    }
  }
  if (!found) return `kein Element „${elementId}" auf dieser Folie`;
  state['layerOrder'] = listOf<string>(state, 'layerOrder').filter((id) => id !== elementId);
  return null;
}

/** Eine neue Folie im Stil des Decks; die Seitenzahl setzt `renumber` danach. */
function composeOne(
  spec: FolieSpec,
  stil: DeckStilId,
  position: number,
  ctx: SlideDeckEditContext
): DeckPage {
  let state = buildFolie(stil, spec, {
    locale: ctx.locale,
    date: ctx.date,
    pageNumber: position + 1,
    title: ctx.title,
    index: position,
  });
  if (ctx.measure) {
    state = fitSlideTexts(state, deckStilBoxes(stil, spec.typ), ctx.measure).state;
  }
  return {
    id: ctx.newPageId(),
    configId: slideLayoutConfigId(ctx.locale),
    state: state as unknown as Record<string, unknown>,
  };
}

/** Seitenzahl in der Fußzeile an die Position anpassen. */
function renumber(pages: DeckPage[]): void {
  pages.forEach((page, index) => {
    const texts = listOf<TextLike>(page.state, 'additionalTexts');
    const label = String(index + 1);
    if (texts.some((t) => t.id === 'folie-seitenzahl' && t.text !== label)) {
      page.state = {
        ...page.state,
        additionalTexts: texts.map((t) =>
          t.id === 'folie-seitenzahl' ? { ...t, text: label } : t
        ),
      };
    }
  });
}

/**
 * Wendet die Operationen der Reihe nach an. Was nicht passt, landet in
 * `refused` (mit Grund) — die übrigen Operationen laufen weiter.
 */
export function applySlideDeckOperations(
  original: readonly DeckPage[],
  operations: readonly SlideDeckOperation[],
  ctx: SlideDeckEditContext
): SlideDeckEditResult {
  const pages: DeckPage[] = original.map((p) => ({ ...p, state: structuredClone(p.state) }));
  const idAt = (n: number): string | null => original[n - 1]?.id ?? null;
  const applied: string[] = [];
  const refused: string[] = [];
  let structural = false;

  for (const op of operations) {
    if (op.kind === 'add-slide') {
      const anchor = op.afterSlide === 0 ? null : idAt(op.afterSlide);
      if (op.afterSlide !== 0 && !anchor) {
        refused.push(`add-slide: Folie ${op.afterSlide} gibt es nicht`);
        continue;
      }
      if (pages.length >= MAX_SLIDES) {
        refused.push(`add-slide: höchstens ${MAX_SLIDES} Folien`);
        continue;
      }
      // Der Anker kann in diesem Stapel schon gelöscht sein: dann hinter den
      // nächsten noch vorhandenen Vorgänger (Originalreihenfolge), sonst nach vorn.
      let at = 0;
      for (let n = op.afterSlide; n >= 1 && at === 0; n--) {
        const id = idAt(n);
        const found = id ? pages.findIndex((p) => p.id === id) : -1;
        if (found >= 0) at = found + 1;
      }
      pages.splice(at, 0, composeOne(op.slide, readDeckStil(pages), at, ctx));
      structural = true;
      applied.push(`Folie (${op.slide.typ}) eingefügt`);
      continue;
    }

    const targetId = idAt(op.slide);
    const index = targetId ? pages.findIndex((p) => p.id === targetId) : -1;
    if (index < 0) {
      refused.push(`${op.kind}: Folie ${op.slide} gibt es nicht (mehr)`);
      continue;
    }

    if (op.kind === 'remove-slide') {
      if (pages.length === 1) {
        refused.push('remove-slide: die letzte Folie bleibt stehen');
        continue;
      }
      pages.splice(index, 1);
      structural = true;
      applied.push(`Folie ${op.slide} gelöscht`);
      continue;
    }

    if (op.kind === 'move-slide') {
      const [page] = pages.splice(index, 1);
      pages.splice(Math.min(op.toPosition, pages.length + 1) - 1, 0, page!);
      structural = true;
      applied.push(`Folie ${op.slide} an Position ${op.toPosition} verschoben`);
      continue;
    }

    const state = pages[index]!.state;
    for (const inner of op.operations) {
      const reason =
        inner.kind === 'set-text'
          ? setText(state, inner.field, inner.value)
          : removeElement(state, inner.elementId);
      if (reason) refused.push(`Folie ${op.slide}: ${reason}`);
      else
        applied.push(
          `Folie ${op.slide}: ${inner.kind} ${inner.kind === 'set-text' ? inner.field : inner.elementId}`
        );
    }
    if (ctx.measure && op.operations.some((o) => o.kind === 'set-text')) {
      // Der neue Text soll in die Box des Stils passen; die Schrift schrumpft nur.
      const typ = readFolie(state)?.typ;
      if (typ) {
        const fitted = fitSlideTexts(
          state as unknown as Parameters<typeof fitSlideTexts>[0],
          deckStilBoxes(readDeckStil(pages), typ),
          ctx.measure
        ).state;
        pages[index]!.state = fitted as unknown as Record<string, unknown>;
      }
    }
    if (op.notes != null) {
      pages[index]!.state['notes'] = op.notes.trim();
      applied.push(`Folie ${op.slide}: Notizen`);
    }
  }

  if (structural) renumber(pages);

  const pagePatches: SlideDeckEditResult['pagePatches'] = [];
  if (!structural) {
    for (const page of pages) {
      const before = original.find((p) => p.id === page.id)!.state;
      const patch: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(page.state)) {
        if (JSON.stringify(value) !== JSON.stringify(before[key])) patch[key] = value;
      }
      if (Object.keys(patch).length > 0) pagePatches.push({ pageId: page.id, patch });
    }
  }

  return { pages, structural, pagePatches, applied, refused };
}
