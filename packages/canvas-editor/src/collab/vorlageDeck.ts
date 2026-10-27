import { SHAREPIC_SOURCE_KEY } from '@gruenerator/contracts';

import { CARRIED_INSTANCE_KEYS } from '../configs/factory/carryInstanceState';

import type { CanvasImpressumParts, CanvasImpressumService } from '../hostServices';
import type { ReplaceDeckOps } from '@ggraphic/editor/collab/pagesDoc';

interface DeckPage {
  configId: string;
  state: Record<string, unknown>;
}

const BLANK_CONFIGS: readonly string[] = ['freeform', 'freeform-at'];

/** These only describe elements; they hold none themselves. */
const DESCRIBING_KEYS: readonly string[] = [
  'layerOrder',
  'lockedLayerIds',
  'iconStates',
  'templateRotations',
  'templateTextAligns',
];
const ELEMENT_KEYS = CARRIED_INSTANCE_KEYS.filter((k) => !DESCRIBING_KEYS.includes(k));

const hasEntries = (value: unknown) => Array.isArray(value) && value.length > 0;

/**
 * Nothing on the design a Vorlage would overwrite: one freeform page with no
 * element, no photo and no composed spec. Its ground colour does not count —
 * every fresh page has one.
 */
export function isDeckEmpty(pages: readonly DeckPage[]): boolean {
  if (pages.length !== 1) return false;
  const { configId, state } = pages[0]!;
  if (!BLANK_CONFIGS.includes(configId)) return false;
  if (state.currentImageSrc || state[SHAREPIC_SOURCE_KEY]) return false;
  if (hasEntries(state.stashedComposerPlanes)) return false;
  return !ELEMENT_KEYS.some((key) => hasEntries(state[key]));
}

type CurrentPage = { id: string; configId: string; state?: Record<string, unknown> };

const hasNotes = (state: Record<string, unknown> | undefined): state is Record<string, unknown> =>
  typeof state?.notes === 'string' && state.notes.trim() !== '';

/**
 * Speaker notes belong to the slide position, not to the design: a Vorlage
 * that replaces a page keeps the notes written there.
 */
function keepNotes(existing: CurrentPage | undefined, state: Record<string, unknown>) {
  return hasNotes(existing?.state) ? { ...state, notes: existing.state.notes } : state;
}

/**
 * The deck change that turns `current` into the Vorlage's pages, page by
 * page: a page of the same config is rewritten in place (it keeps its id),
 * any other is replaced by a new one at its position, and pages beyond the
 * Vorlage's count go. Applied with `replaceDeck`, that is one undo step.
 */
export function vorlageDeckOps(
  current: readonly CurrentPage[],
  next: readonly DeckPage[],
  newPageId: () => string
): ReplaceDeckOps {
  const ops: ReplaceDeckOps = { updates: [], inserts: [], removes: [] };
  const kept = new Set<string>();
  let anchor: string | null = null;
  next.forEach((page, i) => {
    const existing = current[i];
    const state = keepNotes(existing, page.state);
    if (existing && existing.configId === page.configId) {
      ops.updates.push({ pageId: existing.id, state });
      kept.add(existing.id);
      anchor = existing.id;
    } else {
      const pageId = newPageId();
      ops.inserts.push({ afterPageId: anchor, configId: page.configId, state, pageId });
      anchor = pageId;
    }
  });
  ops.removes = current.filter((p) => !kept.has(p.id)).map((p) => p.id);
  return ops;
}

/**
 * The deck change that puts one page of a print Vorlage in place of
 * `pageId` (the last page when it is gone), in one undo step: rewritten in
 * place under the same config, else replaced at its position.
 */
export function pageSwapOps(
  current: readonly CurrentPage[],
  pageId: string | null,
  page: DeckPage,
  newPageId: () => string
): ReplaceDeckOps {
  const found = current.findIndex((p) => p.id === pageId);
  const at = found === -1 ? current.length - 1 : found;
  const target = current[at];
  const state = keepNotes(target, page.state);
  if (target?.configId === page.configId) {
    return { updates: [{ pageId: target.id, state }], inserts: [], removes: [] };
  }
  return {
    updates: [],
    inserts: [
      {
        afterPageId: current[at - 1]?.id ?? null,
        configId: page.configId,
        state,
        pageId: newPageId(),
      },
    ],
    removes: target ? [target.id] : [],
  };
}

const deckOf = (state: Record<string, unknown>): string | null => {
  const source = state[SHAREPIC_SOURCE_KEY] as { deck?: unknown } | undefined;
  return typeof source?.deck === 'string' ? source.deck : null;
};

/**
 * The deck change that adds one Seite: after the anchor page (or at the end),
 * in one undo step. An empty design is filled instead, so the blank page does
 * not stay in front. Following a page of a composed carousel, the Seite joins
 * that carousel, so the chat edits them as one.
 */
export function seiteDeckOps(
  current: readonly { id: string; configId: string; state: Record<string, unknown> }[],
  afterPageId: string | null,
  seite: DeckPage,
  newPageId: () => string
): ReplaceDeckOps {
  if (isDeckEmpty(current)) return vorlageDeckOps(current, [seite], newPageId);
  const anchor = current.find((p) => p.id === afterPageId) ?? current[current.length - 1] ?? null;
  const deck = anchor ? deckOf(anchor.state) : null;
  const own = seite.state[SHAREPIC_SOURCE_KEY];
  const state =
    deck && own && typeof own === 'object'
      ? { ...seite.state, [SHAREPIC_SOURCE_KEY]: { ...own, deck } }
      : seite.state;
  return {
    updates: [],
    inserts: [
      { afterPageId: anchor?.id ?? null, configId: seite.configId, state, pageId: newPageId() },
    ],
    removes: [],
  };
}

interface TextElement {
  id: string;
  text?: string;
}

const textsOf = (state: Record<string, unknown>): TextElement[] =>
  Array.isArray(state.additionalTexts) ? (state.additionalTexts as TextElement[]) : [];

/**
 * A poster Vorlage ships placeholder V.i.S.d.P./Impressum text, which the
 * export gate rejects. When the design being replaced already has a filled-in
 * line, that line goes into the Vorlage's pages instead — written in the
 * country form of each Vorlage page — so the replace does not undo it.
 * The line and its rules come from the host's print service.
 */
export function carryImpressum<P extends DeckPage>(
  impressum: CanvasImpressumService,
  current: readonly DeckPage[],
  next: P[]
): P[] {
  const id = impressum.elementId;
  let parts: CanvasImpressumParts | null = null;
  for (const page of current) {
    const element = textsOf(page.state).find((t) => t.id === id);
    if (!element) continue;
    const parsed = impressum.parse(impressum.localeOf(page), element.text ?? '');
    if (impressum.isComplete(parsed)) {
      parts = parsed;
      break;
    }
  }
  const filled = parts;
  if (!filled) return next;
  return next.map((page) => {
    const texts = textsOf(page.state);
    if (!texts.some((t) => t.id === id)) return page;
    const text = impressum.line(impressum.localeOf(page), filled);
    return {
      ...page,
      state: {
        ...page.state,
        additionalTexts: texts.map((t) => (t.id === id ? { ...t, text } : t)),
      },
    };
  });
}
