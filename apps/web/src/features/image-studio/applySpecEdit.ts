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
  type SharepicItem,
  type SharepicPhotoAttribution,
  type SharepicSlide,
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
 * A hand edit is either kept or reported — never lost silently.
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
  try {
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
      console.warn(
        '[CanvasAiEdit] deck spec invalid after lifting, using the op path',
        source.deck
      );
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
  } catch (err) {
    console.warn('[CanvasAiEdit] lifting the deck failed, using the op path', err);
    return null;
  }
}

// ── matching revised slides to deck pages ───────────────────────────────────

/** Below this text similarity a revised slide is a new slide, not the page's. */
const MATCH_MIN = 0.5;

function editDistance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(
        row[j]! + 1,
        next[j - 1]! + 1,
        row[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    row = next;
  }
  return row[b.length]!;
}

/** Every string under `value` with its dotted path; `type` keys and nested `items` skipped. */
function leaves(value: unknown, path = ''): [string, string][] {
  if (typeof value === 'string') return [[path, value]];
  const at = (k: string | number) => (path ? `${path}.${k}` : String(k));
  if (Array.isArray(value)) return value.flatMap((v, i) => leaves(v, at(i)));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) =>
      k === 'type' || k === 'items' ? [] : leaves(v, at(k))
    );
  }
  return [];
}

const slideText = (slide: SharepicSlide) =>
  slide.items
    .flatMap((item) => leaves(item).map(([, text]) => text))
    .join(' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

function similarity(a: SharepicSlide, b: SharepicSlide): number {
  const x = slideText(a);
  const y = slideText(b);
  if (x === y) return 1;
  return 1 - editDistance(x, y) / Math.max(x.length, y.length);
}

/**
 * For each revised slide the page it continues, or null for a new slide: an
 * order-keeping alignment that maximises the summed text similarity of the
 * matched pairs; between two matches, leftover slides and pages pair up in
 * order (a slide rewritten in place keeps its page).
 */
export function matchSlides(pages: SharepicSlide[], revised: SharepicSlide[]): (number | null)[] {
  const n = pages.length;
  const m = revised.length;
  const score = pages.map((p) => revised.map((r) => similarity(p, r)));
  const best = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const s = score[i - 1]![j - 1]!;
      best[i]![j] = Math.max(
        best[i - 1]![j]!,
        best[i]![j - 1]!,
        s >= MATCH_MIN ? best[i - 1]![j - 1]! + s : -Infinity
      );
    }
  }
  const match: (number | null)[] = new Array<number | null>(m).fill(null);
  for (let i = n, j = m; i > 0 && j > 0;) {
    const s = score[i - 1]![j - 1]!;
    if (s >= MATCH_MIN && best[i]![j] === best[i - 1]![j - 1]! + s) {
      match[j - 1] = i - 1;
      i--;
      j--;
    } else if (best[i]![j] === best[i - 1]![j]) i--;
    else j--;
  }
  let prevPage = -1;
  for (let j = 0; j < m;) {
    if (match[j] !== null) {
      prevPage = match[j]!;
      j++;
      continue;
    }
    let end = j;
    while (end < m && match[end] === null) end++;
    const nextPage = end < m ? match[end]! : n;
    for (let k = 0; j + k < end && prevPage + 1 + k < nextPage; k++)
      match[j + k] = prevPage + 1 + k;
    j = end;
  }
  return match;
}

// ── hand texts typed while the revision ran ─────────────────────────────────

const itemsOfType = (slide: SharepicSlide, type: SharepicItem['type']) =>
  slide.items.filter((i) => i.type === type);

function setAt(target: unknown, path: string, value: string): void {
  const keys = path.split('.');
  const last = keys.pop()!;
  const parent = keys.reduce<unknown>(
    (node, key) => (node as Record<string, unknown>)[key],
    target
  ) as Record<string, unknown>;
  parent[last] = value;
}

/**
 * A text the person changed after sending (now ≠ sent) survives where the
 * model left that field alone (revised = sent); where both changed, the model
 * wins and the field is reported. Mutates `revised`; returns the overruled labels.
 */
function keepLateHandTexts(
  sent: SharepicSlide,
  now: SharepicSlide,
  revised: SharepicSlide
): { patched: boolean; overruled: string[] } {
  let patched = false;
  const overruled: string[] = [];
  const merge = (sentNode: unknown, nowNode: unknown, revisedNode: unknown, label: string) => {
    const sentLeaves = new Map(leaves(sentNode));
    const revisedLeaves = new Map(leaves(revisedNode));
    for (const [path, text] of leaves(nowNode)) {
      const before = sentLeaves.get(path);
      if (before === undefined || before === text) continue;
      if (revisedLeaves.get(path) === before) {
        setAt(revisedNode, path, text);
        patched = true;
      } else {
        overruled.push(label);
      }
    }
  };
  merge(sent, now, revised, 'Folientext');
  const nth = new Map<string, number>();
  for (const item of now.items) {
    const k = nth.get(item.type) ?? 0;
    nth.set(item.type, k + 1);
    const sentItem = itemsOfType(sent, item.type)[k];
    const revisedItem = itemsOfType(revised, item.type)[k];
    if (!sentItem) continue;
    if (!revisedItem) {
      if (JSON.stringify(sentItem) !== JSON.stringify(item)) overruled.push(ITEM_LABEL[item.type]);
      continue;
    }
    merge(sentItem, item, revisedItem, ITEM_LABEL[item.type]);
  }
  return { patched, overruled };
}

// ── apply ───────────────────────────────────────────────────────────────────

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

export interface AppliedSpecEdit {
  status: 'applied';
  /** Hand overrides the revised layout could not keep. */
  dropped: SharepicOverride[];
  /** 1-based positions of removed pages that carried hand edits. */
  removedSlides: number[];
  /** Labels of fields the person and the model both changed; the model won. */
  overruled: string[];
  /** Hand edits the lift could not carry at all. */
  unliftable: number;
  /** Issues the review raised. */
  hinweise: string[];
}

export type SpecEditResult =
  | AppliedSpecEdit
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
  /** The deck spec the request carried, to tell late hand texts from the model's. */
  sent: SharepicSpec;
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
  const compose = (spec: SharepicSpec) =>
    deps.compose(applySharepicTweaks(spec, tweaks), attributions, photoSrc);

  const revised = await reviseWithReview({
    spec: input.sharepic.spec,
    attributions,
    brief: input.brief,
    deps: {
      compose: (spec) => compose(spec),
      render: deps.render,
      review: deps.review,
      applyPatch: deps.applyPatch,
    },
  });
  if (!revised || deps.isStale()) return { status: 'stale' };

  // Lift now, not at request time: hand edits made while the revision ran count too.
  const pages = deps.getPages();
  const { members, lifted } = liftDeck(pages, deck);
  if (members.length === 0) return { status: 'failed' };
  const nowSlides = lifted.map((l) => l.slide.slides[0]!);
  const match = matchSlides(nowSlides, revised.spec.slides);

  const spec = structuredClone(revised.spec);
  const overruled: string[] = [];
  let patched = false;
  // The sent deck lines up with the pages only while nobody added or removed one.
  if (input.sent.slides.length === members.length) {
    match.forEach((i, j) => {
      if (i === null) return;
      const late = keepLateHandTexts(input.sent.slides[i]!, nowSlides[i]!, spec.slides[j]!);
      patched ||= late.patched;
      overruled.push(...late.overruled);
    });
  }
  const composed = patched ? await compose(spec) : revised.composed;
  if (deps.isStale()) return { status: 'stale' };

  const previous = applySharepicTweaks(
    { ...lifted[0]!.slide, slides: lifted.flatMap((l) => l.slide.slides) },
    tweaks
  );
  const fresh = applySharepicTweaks(spec, tweaks);
  const ops: ReplaceDeckOps = { updates: [], inserts: [], removes: [] };
  const dropped: SharepicOverride[] = [];
  let unliftable = 0;
  // A new first slide goes where the deck starts.
  const firstAt = pages.findIndex((p) => p.id === members[0]!.page.id);
  let anchor: string | null = firstAt > 0 ? pages[firstAt - 1]!.id : null;
  composed.slides.forEach((composedSlide, j) => {
    const i = match[j] ?? null;
    const freshInput = oneSlide(fresh, j);
    const page =
      i !== null
        ? recomposePage(
            composedSlide,
            lifted[i]!.overrides,
            lifted[i]!.foreign,
            oneSlide(previous, i),
            freshInput
          )
        : recomposePage(composedSlide, [], [], freshInput, freshInput);
    dropped.push(...page.droppedOverrides);
    if (i !== null) unliftable += lifted[i]!.unliftable.length;
    const source: SharepicSource = {
      v: 1,
      deck,
      slide: oneSlide(spec, j),
      attribution: attributions[j] ?? null,
      ...(Object.keys(tweaks).length > 0 && { tweaks }),
      baseline: page.baseline,
    };
    const state = { ...page.state, [SHAREPIC_SOURCE_KEY]: source };
    if (i !== null) {
      const pageId = members[i]!.page.id;
      ops.updates.push({ pageId, state });
      anchor = pageId;
    } else {
      // Chained anchors keep added slides in order.
      const pageId = deps.newPageId();
      ops.inserts.push({ afterPageId: anchor, pageId, configId: members[0]!.page.configId, state });
      anchor = pageId;
    }
  });
  const kept = new Set(match);
  const removedSlides: number[] = [];
  members.forEach((m, i) => {
    if (kept.has(i)) return;
    ops.removes.push(m.page.id);
    const l = lifted[i]!;
    if (l.overrides.length || l.foreign.length || l.unliftable.length) removedSlides.push(i + 1);
  });
  deps.replaceDeck(ops);
  return {
    status: 'applied',
    dropped,
    removedSlides,
    overruled,
    unliftable,
    hinweise: revised.hinweise,
  };
}

// ── what the person reads ───────────────────────────────────────────────────

const ITEM_LABEL: Record<SharepicItem['type'], string> = {
  absatz: 'Absatz',
  aufruf: 'Aufruf',
  bingo: 'Bingo',
  button: 'Button',
  dachzeile: 'Dachzeile',
  diagramm: 'Diagramm',
  faktencheck: 'Faktencheck',
  frage: 'Frage',
  headline: 'Überschrift',
  iconliste: 'Icon-Liste',
  infografik: 'Infografik',
  liste: 'Liste',
  rechnung: 'Rechnung',
  schlagzeile: 'Schlagzeile',
  termine: 'Termine',
  text: 'Text',
  vergleich: 'Vergleich',
  zahl: 'Zahl',
  zitat: 'Zitat',
};

const overrideLabel = (o: Exclude<SharepicOverride, { kind: 'background' }>): string =>
  o.key.itemType ? ITEM_LABEL[o.key.itemType] : 'Seitenelement';

const list = (labels: string[]) => [...new Set(labels)].join(', ');

/** The status line after a spec edit; null when every hand edit was kept and the review was quiet. */
export function describeSpecEdit(result: AppliedSpecEdit): string | null {
  const moves: string[] = [];
  const others: string[] = [];
  let background = false;
  for (const o of result.dropped) {
    if (o.kind === 'background') background = true;
    else if (o.kind === 'style' && ('x' in o.props || 'y' in o.props)) moves.push(overrideLabel(o));
    else others.push(overrideLabel(o));
  }
  const lines = [
    moves.length > 0 && `Deine Verschiebung von ${list(moves)} ließ sich nicht übernehmen.`,
    others.length > 0 && `Deine Änderung an ${list(others)} ließ sich nicht übernehmen.`,
    background && 'Deine Änderung am Hintergrund ließ sich nicht übernehmen.',
    result.unliftable > 0 && 'Eine Änderung von Hand ließ sich nicht übernehmen.',
    ...result.removedSlides.map(
      (k) => `Folie ${k} entfernt – deine Änderungen darauf wurden verworfen.`
    ),
    result.overruled.length > 0 &&
      `Deine Textänderung an ${list(result.overruled)} während der Überarbeitung wurde überschrieben.`,
    result.hinweise.length > 0 && `Hinweise der Prüfung: ${result.hinweise.join(' · ')}`,
  ].filter((line): line is string => !!line);
  return lines.length > 0 ? lines.join(' ') : null;
}
