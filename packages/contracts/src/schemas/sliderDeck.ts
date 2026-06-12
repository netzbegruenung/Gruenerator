/**
 * Slider-deck interpreter: translates validated `SliderDeckOperation`s into
 * pageId-addressed patches and structural page ops for the Hocuspocus
 * internal API. Per-slide edits delegate to `sharepicOpsToStatePatch`, so all
 * single-page clamping/rejecting applies unchanged.
 */
import { type CanvasAiOperation, type SliderDeckOperation } from './canvasAi.js';
import {
  sharepicOpsToStatePatch,
  type SharepicTemplateDescriptor,
} from './canvasTemplateDescriptors.js';

export interface SliderDeckPage {
  id: string;
  configId: string;
  state: Record<string, unknown>;
}

export type SliderDeckPageOp =
  | { op: 'add'; index: number; page: SliderDeckPage }
  | { op: 'remove'; pageId: string };

export interface SliderDeckOpsResult {
  pagePatches: Array<{ pageId: string; patch: Record<string, unknown> }>;
  pageOps: SliderDeckPageOp[];
  /** Resulting full deck (version snapshot + DB mirror). */
  newPages: SliderDeckPage[];
  applied: SliderDeckOperation[];
  rejected: Array<{ op: SliderDeckOperation | CanvasAiOperation; reason: string }>;
}

const newPageId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `p-${Math.random().toString(36).slice(2, 11)}`;

const SLIDE_VARIANT_LABELS: Record<string, string> = {
  cover: 'Cover',
  content: 'Inhalt',
  last: 'Abschluss',
};

/** The slider config keys its arrow decoration under this icon id. */
const ARROW_ICON_ID = 'hi-chevronright';

interface PillBadgeLike {
  backgroundColor?: string;
  textColor?: string;
  text?: string;
}

/**
 * Mirror of the studio's `setColorScheme` action: alongside `colorScheme`
 * the derived backgroundColor, pill badge colors and arrow icon color must
 * change too — a raw state patch bypasses the action coupling.
 */
function buildSchemePatch(
  descriptor: SharepicTemplateDescriptor,
  schemeId: string,
  state: Record<string, unknown>
): Record<string, unknown> {
  const colors = descriptor.deck?.schemeColors[schemeId];
  const stateKey = descriptor.colorSchemes?.stateKey ?? 'colorScheme';
  const patch: Record<string, unknown> = { [stateKey]: schemeId };
  if (!colors) return patch;
  patch['backgroundColor'] = colors.background;

  const pills = state['pillBadgeInstances'];
  if (Array.isArray(pills) && pills.length > 0) {
    patch['pillBadgeInstances'] = pills.map((p: PillBadgeLike) => ({
      ...p,
      backgroundColor: colors.pillBackground,
      textColor: colors.pillText,
    }));
  }
  const icons = state['iconStates'];
  if (icons && typeof icons === 'object' && ARROW_ICON_ID in (icons as object)) {
    const iconStates = icons as Record<string, Record<string, unknown>>;
    patch['iconStates'] = {
      ...iconStates,
      [ARROW_ICON_ID]: { ...iconStates[ARROW_ICON_ID], color: colors.arrow },
    };
  }
  return patch;
}

/**
 * The visible pill text on mounted cover slides lives in
 * `pillBadgeInstances[0].text`, not in `state.label` — keep both in sync.
 */
function withPillText(
  patch: Record<string, unknown>,
  state: Record<string, unknown>
): Record<string, unknown> {
  if (!('label' in patch)) return patch;
  const pills = state['pillBadgeInstances'];
  if (!Array.isArray(pills) || pills.length === 0) return patch;
  return {
    ...patch,
    pillBadgeInstances: pills.map((p: PillBadgeLike, i: number) =>
      i === 0 ? { ...p, text: patch['label'] } : p
    ),
  };
}

export function sliderDeckOpsToPagePatches(
  descriptor: SharepicTemplateDescriptor,
  ops: SliderDeckOperation[],
  pages: SliderDeckPage[]
): SliderDeckOpsResult {
  const deck = descriptor.deck;
  const pagePatchById = new Map<string, Record<string, unknown>>();
  const pageOps: SliderDeckPageOp[] = [];
  const applied: SliderDeckOperation[] = [];
  const rejected: SliderDeckOpsResult['rejected'] = [];
  // Pages added in this batch don't exist in Yjs when pagePatches apply
  // (patches run before pageOps) — fold their edits into the add op instead.
  const addedPages = new Map<string, SliderDeckPage>();

  const working: SliderDeckPage[] = pages.map((p) => ({ ...p, state: { ...p.state } }));

  const mergePatch = (page: SliderDeckPage, patch: Record<string, unknown>): void => {
    if (Object.keys(patch).length === 0) return;
    page.state = { ...page.state, ...patch };
    const added = addedPages.get(page.id);
    if (added) {
      added.state = { ...added.state, ...patch };
      return;
    }
    pagePatchById.set(page.id, { ...(pagePatchById.get(page.id) ?? {}), ...patch });
  };

  if (!deck) {
    return {
      pagePatches: [],
      pageOps: [],
      newPages: working,
      applied,
      rejected: ops.map((op) => ({ op, reason: `${descriptor.id} ist kein Folien-Deck` })),
    };
  }

  for (const op of ops) {
    if (op.kind === 'edit-slide') {
      const idx = op.slide - 1;
      const page = working[idx];
      if (!page) {
        rejected.push({ op, reason: `Slide ${op.slide} existiert nicht (1–${working.length})` });
        continue;
      }
      const result = sharepicOpsToStatePatch(descriptor, op.operations, page.state);
      rejected.push(...result.rejected);
      if (result.applied.length === 0) continue;

      const schemeOp = result.applied.find((o) => o.kind === 'set-color-scheme');
      if (schemeOp && schemeOp.kind === 'set-color-scheme') {
        // Color scheme is a deck-wide property — expand to every slide with
        // the derived colors, regardless of which slide the LLM targeted.
        for (const p of working) {
          mergePatch(p, buildSchemePatch(descriptor, schemeOp.schemeId, p.state));
        }
        const stateKey = descriptor.colorSchemes?.stateKey ?? 'colorScheme';
        delete result.patch[stateKey];
      }
      mergePatch(page, withPillText(result.patch, page.state));
      applied.push(op);
    } else if (op.kind === 'add-slide') {
      if (working.length >= deck.maxSlides) {
        rejected.push({ op, reason: `Maximal ${deck.maxSlides} Slides` });
        continue;
      }
      // Default: before the closing slide. afterSlide is clamped so nothing
      // can land before the cover or after the closing slide.
      const insertAfter = Math.min(op.afterSlide ?? working.length - 1, working.length - 1);
      const index = Math.max(1, insertAfter);
      const coverState = working[0]?.state ?? {};
      const schemeId =
        typeof coverState['colorScheme'] === 'string' ? coverState['colorScheme'] : 'sand-tanne';
      const page: SliderDeckPage = {
        id: newPageId(),
        configId: descriptor.id,
        state: {
          ...deck.defaultNewSlideState,
          headline: op.headline,
          subtext: op.subtext ?? '',
          subtext2: op.subtext2 ?? '',
          colorScheme: schemeId,
          ...(deck.schemeColors[schemeId]
            ? { backgroundColor: deck.schemeColors[schemeId].background }
            : {}),
        },
      };
      working.splice(index, 0, page);
      addedPages.set(page.id, page);
      pageOps.push({ op: 'add', index, page });
      applied.push(op);
    } else {
      const idx = op.slide - 1;
      const page = working[idx];
      if (!page) {
        rejected.push({ op, reason: `Slide ${op.slide} existiert nicht (1–${working.length})` });
        continue;
      }
      if (idx === 0) {
        rejected.push({ op, reason: 'Das Cover (Slide 1) kann nicht entfernt werden' });
        continue;
      }
      if (idx === working.length - 1) {
        rejected.push({ op, reason: 'Die Abschluss-Folie kann nicht entfernt werden' });
        continue;
      }
      if (working.length <= deck.minSlides) {
        rejected.push({ op, reason: `Mindestens ${deck.minSlides} Slides nötig` });
        continue;
      }
      working.splice(idx, 1);
      if (addedPages.has(page.id)) {
        // Added and removed in the same batch — drop the pending add op.
        addedPages.delete(page.id);
        const addIdx = pageOps.findIndex((o) => o.op === 'add' && o.page.id === page.id);
        if (addIdx >= 0) pageOps.splice(addIdx, 1);
      } else {
        pagePatchById.delete(page.id);
        pageOps.push({ op: 'remove', pageId: page.id });
      }
      applied.push(op);
    }
  }

  return {
    pagePatches: [...pagePatchById.entries()].map(([pageId, patch]) => ({ pageId, patch })),
    pageOps,
    newPages: working,
    applied,
    rejected,
  };
}

const trim = (v: unknown, max = 90): string => {
  const s = typeof v === 'string' ? v : '';
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

/** Compact per-slide snapshot lines for the LLM (~40 tokens per slide). */
export function buildSliderDeckSnapshotLines(
  descriptor: SharepicTemplateDescriptor,
  pages: SliderDeckPage[]
): string[] {
  const schemeKey = descriptor.colorSchemes?.stateKey ?? 'colorScheme';
  const scheme = pages[0]?.state[schemeKey];
  const lines: string[] = [
    `Karussell mit ${pages.length} Slides (max. ${descriptor.deck?.maxSlides ?? 10})` +
      (typeof scheme === 'string' ? ` — Farbschema: ${scheme} (gilt für alle Slides)` : ''),
  ];
  pages.forEach((page, i) => {
    const rawVariant = page.state['slideVariant'];
    const variant = typeof rawVariant === 'string' ? rawVariant : '';
    const variantLabel = SLIDE_VARIANT_LABELS[variant] ?? variant;
    const parts: string[] = [];
    for (const f of descriptor.textFields) {
      // Cover-only / content-only fields stay out of irrelevant slides.
      if (f.field === 'label' && variant !== 'cover') continue;
      if (f.field === 'subtext2' && variant !== 'content') continue;
      const value = trim(page.state[f.stateKey]);
      const size = f.fontSize ? page.state[f.fontSize.stateKey] : undefined;
      const sizeInfo = typeof size === 'number' ? ` [${Math.round(size)}px]` : '';
      parts.push(`${f.label.replace(/ \(.*\)$/, '')}${sizeInfo}: "${value}"`);
    }
    lines.push(`Slide ${i + 1}/${pages.length} (${variantLabel}) — ${parts.join(' | ')}`);
  });
  return lines;
}
