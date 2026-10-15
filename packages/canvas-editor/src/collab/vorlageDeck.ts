import { SHAREPIC_SOURCE_KEY } from '@gruenerator/contracts';

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
