import { SHAREPIC_SOURCE_KEY } from '@gruenerator/contracts';

import { PRINT_IMPRESSUM_ID } from '../composer/composePrint';
import {
  impressumLine,
  impressumLocaleOf,
  isImpressumComplete,
  parseImpressumLine,
  type ImpressumParts,
} from '../composer/printImpressum';
import { CARRIED_INSTANCE_KEYS } from '../configs/factory/carryInstanceState';

import type { ReplaceDeckOps } from './pagesDoc';

interface DeckPage {
  configId: string;
  state: Record<string, unknown>;
}

const BLANK_CONFIGS: readonly string[] = ['freeform', 'freeform-at'];

/** `layerOrder` and `iconStates` only describe elements; they hold none themselves. */
const ELEMENT_KEYS = CARRIED_INSTANCE_KEYS.filter((k) => k !== 'layerOrder' && k !== 'iconStates');

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

/**
 * The deck change that turns `current` into the Vorlage's pages, page by
 * page: a page of the same config is rewritten in place (it keeps its id),
 * any other is replaced by a new one at its position, and pages beyond the
 * Vorlage's count go. Applied with `replaceDeck`, that is one undo step.
 */
export function vorlageDeckOps(
  current: readonly { id: string; configId: string }[],
  next: readonly DeckPage[],
  newPageId: () => string
): ReplaceDeckOps {
  const ops: ReplaceDeckOps = { updates: [], inserts: [], removes: [] };
  const kept = new Set<string>();
  let anchor: string | null = null;
  next.forEach((page, i) => {
    const existing = current[i];
    if (existing && existing.configId === page.configId) {
      ops.updates.push({ pageId: existing.id, state: page.state });
      kept.add(existing.id);
      anchor = existing.id;
    } else {
      const pageId = newPageId();
      ops.inserts.push({ afterPageId: anchor, configId: page.configId, state: page.state, pageId });
      anchor = pageId;
    }
  });
  ops.removes = current.filter((p) => !kept.has(p.id)).map((p) => p.id);
  return ops;
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
 */
export function carryImpressum<P extends DeckPage>(current: readonly DeckPage[], next: P[]): P[] {
  let parts: ImpressumParts | null = null;
  for (const page of current) {
    const element = textsOf(page.state).find((t) => t.id === PRINT_IMPRESSUM_ID);
    if (!element) continue;
    const parsed = parseImpressumLine(impressumLocaleOf(page), element.text ?? '');
    if (isImpressumComplete(parsed)) {
      parts = parsed;
      break;
    }
  }
  const filled = parts;
  if (!filled) return next;
  return next.map((page) => {
    const texts = textsOf(page.state);
    if (!texts.some((t) => t.id === PRINT_IMPRESSUM_ID)) return page;
    const text = impressumLine(impressumLocaleOf(page), filled);
    return {
      ...page,
      state: {
        ...page.state,
        additionalTexts: texts.map((t) => (t.id === PRINT_IMPRESSUM_ID ? { ...t, text } : t)),
      },
    };
  });
}
