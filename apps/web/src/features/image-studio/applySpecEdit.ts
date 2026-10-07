import {
  applySharepicTweaks,
  type ComposedSharepic,
  deckPages,
  deckSpec,
  liftPage,
  readSharepicSource,
  recomposePage,
  type SharepicOverride,
} from '@gruenerator/canvas-editor/composer';
import {
  type CurrentCanvasSharepic,
  SHAREPIC_SOURCE_KEY,
  type SharepicPhotoAttribution,
  type SharepicSource,
  type SharepicSpec,
} from '@gruenerator/contracts';

import { creatorPhotoSrc } from './freitext/composeForRender';
import { reviseWithReview, type RevisionDeps } from './freitext/sharepicRevisionLoop';

import type { ReplaceDeckOps } from '@gruenerator/canvas-editor';

/**
 * Spec path of the canvas chat: a creator page (one with a `sharepicSource`)
 * is edited through its semantic spec instead of canvas ops. The request
 * carries the deck spec with the hand texts lifted in; the revised spec comes
 * back, is reviewed, recomposed page by page with the hand moves and the
 * user's own elements put back, and replaces the deck in one undo step.
 */

export interface SpecEditPage {
  id: string;
  configId: string;
  state: Record<string, unknown>;
}

const oneSlide = (spec: SharepicSpec, i: number): SharepicSpec => ({
  ...spec,
  slides: [spec.slides[i]!],
});

function liftDeck(pages: readonly SpecEditPage[], deck: string) {
  const members = deckPages(pages, deck);
  const lifted = members.map((m) => liftPage(m.page.state, m.source));
  return { members, lifted };
}

/** The `currentCanvas.sharepic` context, or null when the active page has no usable source (op path). */
export function specEditContext(
  pages: readonly SpecEditPage[],
  activePageId: string | null,
  selection: string[]
): { deck: string; sharepic: CurrentCanvasSharepic } | null {
  const active = pages.find((p) => p.id === activePageId);
  const source = active ? readSharepicSource(active) : null;
  if (!active || !source) return null;
  const { members, lifted } = liftDeck(pages, source.deck);
  const spec = deckSpec(
    members.map((m, i) => ({
      configId: m.page.configId,
      state: { [SHAREPIC_SOURCE_KEY]: { ...m.source, slide: lifted[i]!.slide } },
    })),
    source.deck
  );
  if (!spec) {
    console.warn('[CanvasAiEdit] deck spec invalid after lifting, using the op path', source.deck);
    return null;
  }
  return {
    deck: source.deck,
    sharepic: {
      deckSpec: spec,
      focusSlide: members.findIndex((m) => m.page.id === active.id),
      selection,
    },
  };
}

export interface SpecEditDeps extends Omit<RevisionDeps, 'compose'> {
  /** The live pages, read before the revision and again right before applying. */
  getPages: () => readonly SpecEditPage[];
  compose: (
    spec: SharepicSpec,
    attributions: (SharepicPhotoAttribution | null)[],
    photoSrc: (filename: string) => string
  ) => Promise<ComposedSharepic>;
  replaceDeck: (ops: ReplaceDeckOps) => string[];
  /** A newer edit arrived while this one was revising. */
  isStale: () => boolean;
  newPageId: () => string;
}

export type SpecEditResult =
  | { status: 'applied'; dropped: SharepicOverride[] }
  | { status: 'stale' }
  /** The deck's pages are gone. */
  | { status: 'failed' };

/** Own photos (`upload:N`) resolve to the URL the page already shows. */
function uploadSources(members: { source: SharepicSource }[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const { source } of members) {
    const bg = source.slide.slides[0]!.background;
    const src = source.baseline.background.imageSrc;
    if (bg.kind !== 'farbe' && src) map.set(bg.filename, src);
  }
  return map;
}

export async function applySpecEdit(input: {
  deck: string;
  sharepic: { spec: SharepicSpec; attributions: (SharepicPhotoAttribution | null)[] };
  brief: string;
  deps: SpecEditDeps;
}): Promise<SpecEditResult> {
  const { deck, deps } = input;
  const start = deckPages(deps.getPages(), deck);
  if (start.length === 0) return { status: 'failed' };
  // Tweaks are a deck choice, minted alike on every page.
  const tweaks = start[0]!.source.tweaks ?? {};
  const uploads = uploadSources(start);
  const photoSrc = (filename: string) => uploads.get(filename) ?? creatorPhotoSrc(filename);
  const { attributions } = input.sharepic;

  const revised = await reviseWithReview({
    spec: input.sharepic.spec,
    attributions,
    brief: input.brief,
    deps: {
      compose: (spec, a) => deps.compose(applySharepicTweaks(spec, tweaks), a, photoSrc),
      render: deps.render,
      review: deps.review,
      applyPatch: deps.applyPatch,
    },
  });
  if (!revised || deps.isStale()) return { status: 'stale' };

  // Lift now, not at request time: hand edits made while the revision ran count too.
  const { members, lifted } = liftDeck(deps.getPages(), deck);
  if (members.length === 0) return { status: 'failed' };
  const previous = applySharepicTweaks(
    { ...lifted[0]!.slide, slides: lifted.flatMap((l) => l.slide.slides) },
    tweaks
  );
  const fresh = applySharepicTweaks(revised.spec, tweaks);

  const ops: ReplaceDeckOps = { updates: [], inserts: [], removes: [] };
  const dropped: SharepicOverride[] = [];
  let anchor = members[members.length - 1]!.page.id;
  revised.composed.slides.forEach((composedSlide, i) => {
    const member = members[i];
    const freshInput = oneSlide(fresh, i);
    const page = member
      ? recomposePage(
          composedSlide,
          lifted[i]!.overrides,
          lifted[i]!.foreign,
          oneSlide(previous, i),
          freshInput
        )
      : recomposePage(composedSlide, [], [], freshInput, freshInput);
    dropped.push(...page.droppedOverrides);
    const source: SharepicSource = {
      v: 1,
      deck,
      slide: oneSlide(revised.spec, i),
      attribution: attributions[i] ?? null,
      ...(Object.keys(tweaks).length > 0 && { tweaks }),
      baseline: page.baseline,
    };
    const state = { ...page.state, [SHAREPIC_SOURCE_KEY]: source };
    if (member) {
      ops.updates.push({ pageId: member.page.id, state });
    } else {
      // Chained anchors keep added slides in order behind the deck.
      const pageId = deps.newPageId();
      ops.inserts.push({ afterPageId: anchor, pageId, configId: members[0]!.page.configId, state });
      anchor = pageId;
    }
  });
  ops.removes = members.slice(revised.composed.slides.length).map((m) => m.page.id);
  deps.replaceDeck(ops);
  return { status: 'applied', dropped };
}

const overrideLabel = (o: SharepicOverride): string => {
  if (o.kind === 'background') return 'Bildausschnitt';
  const type = o.key.itemType;
  return type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Seitenelement';
};

/** The chat line for hand edits the new spec could not keep; null when none were lost. */
export function describeDroppedOverrides(dropped: SharepicOverride[]): string | null {
  const isMove = (o: SharepicOverride) => o.kind === 'style' && ('x' in o.props || 'y' in o.props);
  const labels = (list: SharepicOverride[]) => [...new Set(list.map(overrideLabel))].join(', ');
  const moves = dropped.filter(isMove);
  const others = dropped.filter((o) => !isMove(o));
  const lines = [
    moves.length > 0 && `Deine Verschiebung von ${labels(moves)} ließ sich nicht übernehmen.`,
    others.length > 0 && `Deine Änderung an ${labels(others)} ließ sich nicht übernehmen.`,
  ].filter((line): line is string => !!line);
  return lines.length > 0 ? lines.join(' ') : null;
}
