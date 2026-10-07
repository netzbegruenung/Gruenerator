import {
  applySharepicTweaks,
  type ComposedSharepic,
  deckPages,
  deckSpec,
  editDistance,
  liftPage,
  readSharepicSource,
  recomposePage,
  type SharepicOverride,
  textLeaves,
} from '@gruenerator/canvas-editor/composer';
import {
  type CurrentCanvasSharepic,
  isSharepicUploadId,
  SHAREPIC_ITEM_LABELS,
  SHAREPIC_SELECTION_MAX,
  SHAREPIC_SOURCE_KEY,
  type SharepicItem,
  type SharepicPatchOp,
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
): { deck: string; pageIds: string[]; sharepic: CurrentCanvasSharepic } | null {
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
      // Which page each sent slide came from; the reply is paired by id, not position.
      pageIds: members.map((m) => m.page.id),
      sharepic: {
        deckSpec: spec,
        focusSlide: members.findIndex((m) => m.page.id === active.id),
        // Only composer elements have a spec counterpart; own elements mean nothing to the draft.
        selection: selection
          .filter((id) => /^(?:chart-)?sc-/.test(id))
          .slice(0, SHAREPIC_SELECTION_MAX),
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

/**
 * Every string under `value` with its dotted path. A slide's own fields leave
 * its `items` out (each item is compared on its own); an item keeps them — a
 * list's points live there.
 */
const leaves = (value: unknown, type: SharepicItem['type'] | null) =>
  textLeaves(value, type === null ? ['type', 'items'] : ['type']);

const slideText = (slide: SharepicSlide) =>
  [
    slide.background.kind,
    'filename' in slide.background ? slide.background.filename : '',
    ...slide.items.flatMap((item) => leaves(item, item.type).map(([, text]) => text)),
  ]
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

/** The page a revised slide continues; `filled`: paired only by position, its content differs. */
export interface SlideMatch {
  index: number;
  filled: boolean;
}

/**
 * For each revised slide the page it continues, or null for a new slide: an
 * order-keeping alignment that maximises the summed text similarity of the
 * matched pairs; between two matches, leftover slides and pages pair up in
 * order (a slide rewritten in place keeps its page, `filled`).
 */
export function matchSlides(
  pages: SharepicSlide[],
  revised: SharepicSlide[]
): (SlideMatch | null)[] {
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
  const match: (SlideMatch | null)[] = new Array<SlideMatch | null>(m).fill(null);
  for (let i = n, j = m; i > 0 && j > 0;) {
    const s = score[i - 1]![j - 1]!;
    if (s >= MATCH_MIN && best[i]![j] === best[i - 1]![j - 1]! + s) {
      match[j - 1] = { index: i - 1, filled: false };
      i--;
      j--;
    } else if (best[i]![j] === best[i - 1]![j]) i--;
    else j--;
  }
  let prevPage = -1;
  for (let j = 0; j < m;) {
    if (match[j] !== null) {
      prevPage = match[j]!.index;
      j++;
      continue;
    }
    let end = j;
    while (end < m && match[end] === null) end++;
    const nextPage = end < m ? match[end]!.index : n;
    for (let k = 0; j + k < end && prevPage + 1 + k < nextPage; k++) {
      match[j + k] = { index: prevPage + 1 + k, filled: true };
    }
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
  const merge = (
    sentNode: unknown,
    nowNode: unknown,
    revisedNode: unknown,
    type: SharepicItem['type'] | null
  ) => {
    const sentLeaves = new Map(leaves(sentNode, type));
    const revisedLeaves = new Map(leaves(revisedNode, type));
    for (const [path, text] of leaves(nowNode, type)) {
      const before = sentLeaves.get(path);
      const after = revisedLeaves.get(path);
      if (before === undefined || before === text || after === text) continue;
      if (after === before) {
        setAt(revisedNode, path, text);
        patched = true;
      } else {
        overruled.push(textLabel(type, path, text));
      }
    }
  };
  merge(sent, now, revised, null);
  const nth = new Map<string, number>();
  for (const item of now.items) {
    const k = nth.get(item.type) ?? 0;
    nth.set(item.type, k + 1);
    const sentItem = itemsOfType(sent, item.type)[k];
    const revisedItem = itemsOfType(revised, item.type)[k];
    if (!sentItem) continue;
    if (!revisedItem) {
      if (JSON.stringify(sentItem) !== JSON.stringify(item)) {
        overruled.push(SHAREPIC_ITEM_LABELS[item.type]);
      }
      continue;
    }
    merge(sentItem, item, revisedItem, item.type);
  }
  return { patched, overruled };
}

/**
 * Labels of fields the person had typed by hand before sending (sent ≠ the
 * composed base) that the revision then rewrote: the requested change replaced them.
 */
function replacedHandTexts(
  base: SharepicSlide,
  sent: SharepicSlide,
  revised: SharepicSlide
): string[] {
  const out: string[] = [];
  const compare = (
    baseNode: unknown,
    sentNode: unknown,
    revisedNode: unknown,
    type: SharepicItem['type'] | null
  ) => {
    const baseLeaves = new Map(leaves(baseNode, type));
    const revisedLeaves = new Map(leaves(revisedNode, type));
    for (const [path, text] of leaves(sentNode, type)) {
      if (baseLeaves.get(path) !== text && revisedLeaves.get(path) !== text) {
        out.push(textLabel(type, path, text));
      }
    }
  };
  compare(base, sent, revised, null);
  const nth = new Map<string, number>();
  for (const item of sent.items) {
    const k = nth.get(item.type) ?? 0;
    nth.set(item.type, k + 1);
    const baseItem = itemsOfType(base, item.type)[k];
    if (!baseItem) continue;
    compare(baseItem, item, itemsOfType(revised, item.type)[k] ?? null, item.type);
  }
  return out;
}

// ── review patches during an edit ───────────────────────────────────────────

/** The counterpart (type and rank) on `before` of `after.items[index]`. */
function counterpart(before: SharepicSlide, after: SharepicSlide, index: number) {
  const item = after.items[index];
  if (!item) return null;
  const k = after.items.slice(0, index).filter((i) => i.type === item.type).length;
  return itemsOfType(before, item.type)[k] ?? null;
}

/** Whether `after.items[index]` differs from its counterpart (type and rank) on `before`. */
function itemChanged(before: SharepicSlide, after: SharepicSlide, index: number): boolean {
  const item = after.items[index];
  const prev = counterpart(before, after, index);
  return !!item && (!prev || JSON.stringify(prev) !== JSON.stringify(item));
}

const sameLines = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((line, i) => line.trim() === b[i]!.trim());

/**
 * Live the review shrank a headline right after "Schrift größer": an op that
 * puts back what the person had before the edit undoes the requested change.
 */
function revertsEdit(
  op: SharepicPatchOp,
  before: SharepicSlide,
  after: SharepicSlide,
  index: number
) {
  if (op.op === 'set_color') {
    return (
      before.background.kind === 'farbe' &&
      before.background.color === op.color &&
      JSON.stringify(before.background) !== JSON.stringify(after.background)
    );
  }
  const prev = counterpart(before, after, index);
  if (op.op === 'set_headline') return prev?.type === 'headline' && sameLines(prev.lines, op.lines);
  if (op.op === 'set_text') return !!prev && 'text' in prev && prev.text.trim() === op.text.trim();
  return false;
}

/**
 * The review's patch narrowed to the edit: text ops only reach items the
 * revision changed (or slides it added), so an untargeted text — a Dachzeile,
 * a hand text — is never rewritten by the check; and no op may put back what
 * the edit just changed. Other layout and colour ops stay.
 */
export function reviewPatchForEdit(
  sent: SharepicSpec,
  spec: SharepicSpec,
  patch: SharepicPatchOp[]
): SharepicPatchOp[] {
  const match = matchSlides(sent.slides, spec.slides);
  return patch.filter((op) => {
    const isText = op.op === 'set_text' || op.op === 'set_headline' || op.op === 'remove_item';
    if (!isText && op.op !== 'set_color') return true;
    const j = op.slide ?? 0;
    const slide = spec.slides[j];
    if (!slide) return !isText;
    const m = match[j];
    if (!m || m.filled) return true;
    const before = sent.slides[m.index]!;
    const index =
      op.op === 'set_headline'
        ? (op.item ?? slide.items.findIndex((i) => i.type === 'headline'))
        : op.op === 'set_text' || op.op === 'remove_item'
          ? op.item
          : -1;
    if (revertsEdit(op, before, slide, index)) {
      console.debug('[CanvasAiEdit] review op dropped: it would undo the requested edit', op);
      return false;
    }
    return !isText || itemChanged(before, slide, index);
  });
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
  /** 1-based positions of pages that now show a different slide; their hand edits were dropped. */
  rewrittenSlides: number[];
  /** Labels of fields the person and the model both changed; the model won. */
  overruled: string[];
  /** Labels of hand-typed fields the requested change rewrote. */
  replaced: string[];
  /** The draft's own note (an off-palette colour, a missing photo). */
  hinweis: string | null;
  /** Issues the review raised. */
  hinweise: string[];
  /** 1-based positions of slides whose own photo (`upload:N`) the revision replaced. */
  ownPhotoReplaced: number[];
  /** Pages of the deck after the edit. */
  slideCount: number;
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

const uploadOf = (slide: SharepicSlide): string | null =>
  slide.background.kind !== 'farbe' && isSharepicUploadId(slide.background.filename)
    ? slide.background.filename
    : null;

/** 1-based positions of sent slides whose own photo the matching revised slide no longer shows. */
export function ownPhotoReplaced(
  sent: SharepicSlide[],
  revised: SharepicSlide[],
  match: (SlideMatch | null)[]
): number[] {
  return match
    .flatMap((m, j) => {
      const upload = m && uploadOf(sent[m.index]!);
      return upload && uploadOf(revised[j]!) !== upload ? [m.index + 1] : [];
    })
    .sort((a, b) => a - b);
}

export async function applySpecEdit(input: {
  deck: string;
  /** The deck spec the request carried and the page each slide came from. */
  sent: { spec: SharepicSpec; pageIds: string[] };
  sharepic: {
    spec: SharepicSpec;
    attributions: (SharepicPhotoAttribution | null)[];
    /** The draft's own note to the person, e.g. an off-palette colour it swapped. */
    hinweis?: string | null;
  };
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
  const compose = (spec: SharepicSpec, credits: (SharepicPhotoAttribution | null)[]) =>
    deps.compose(applySharepicTweaks(spec, tweaks), credits, photoSrc);

  const revised = await reviseWithReview({
    spec: input.sharepic.spec,
    attributions,
    brief: input.brief,
    deps: {
      compose: (spec, credits) => compose(spec, credits),
      render: deps.render,
      review: deps.review,
      applyPatch: deps.applyPatch,
    },
  });
  if (!revised || deps.isStale()) return { status: 'stale' };

  const sentSlides = input.sent.spec.slides;
  // Revised slides pair with the slides the model saw, and through those with
  // page ids: pages added, removed or moved meanwhile cannot shift the pairing.
  const match = matchSlides(sentSlides, revised.spec.slides);

  /** Lifts the live deck and merges it with the revision; null when nothing is left to place. */
  const plan = () => {
    const pages = deps.getPages();
    const { members, lifted } = liftDeck(pages, deck);
    if (members.length === 0) return null;
    const memberAt = new Map(members.map((m, i) => [m.page.id, i]));
    const spec = structuredClone(revised.spec);
    const overruled: string[] = [];
    const replaced: string[] = [];
    let recompose = false;
    const placed: { slide: number; member: number | null; filled: boolean; lateLost: boolean }[] =
      [];
    match.forEach((m, j) => {
      if (m === null) {
        placed.push({ slide: j, member: null, filled: false, lateLost: false });
        return;
      }
      const member = memberAt.get(input.sent.pageIds[m.index]!);
      // Its page was deleted while the model worked: the deletion stands.
      if (member === undefined) {
        recompose = true;
        return;
      }
      const now = lifted[member]!.slide.slides[0]!;
      if (!m.filled) {
        const base = members[member]!.source.slide.slides[0]!;
        replaced.push(...replacedHandTexts(base, sentSlides[m.index]!, spec.slides[j]!));
      }
      const late = keepLateHandTexts(sentSlides[m.index]!, now, spec.slides[j]!);
      recompose ||= late.patched;
      // A rewritten page gets one line for all it lost (below), not two.
      if (!m.filled) overruled.push(...late.overruled);
      placed.push({ slide: j, member, filled: m.filled, lateLost: late.overruled.length > 0 });
    });
    if (placed.length === 0) return null;
    const next: SharepicSpec = { ...spec, slides: placed.map((p) => spec.slides[p.slide]!) };
    const credits = placed.map((p) => attributions[p.slide] ?? null);
    const seen = JSON.stringify(members.map((m) => [m.page.id, m.page.state]));
    return { pages, members, lifted, overruled, replaced, recompose, placed, next, credits, seen };
  };

  // Lift now, not at request time: hand edits made while the revision ran count too.
  let planned = plan();
  if (!planned) return { status: 'failed' };
  let composed = revised.composed;
  for (let pass = 1; planned.recompose; pass++) {
    composed = await compose(planned.next, planned.credits);
    if (deps.isStale()) return { status: 'stale' };
    // Hand edits made while composing would be overwritten: lift again.
    const again = plan();
    if (!again) return { status: 'failed' };
    if (again.seen === planned.seen || pass === 3) break;
    planned = again;
    composed = revised.composed;
  }
  const { pages, members, lifted, overruled, replaced, placed, next, credits } = planned;

  const previous = applySharepicTweaks(
    { ...lifted[0]!.slide, slides: lifted.flatMap((l) => l.slide.slides) },
    tweaks
  );
  const fresh = applySharepicTweaks(next, tweaks);
  const ops: ReplaceDeckOps = { updates: [], inserts: [], removes: [] };
  const dropped: SharepicOverride[] = [];
  const rewrittenSlides: number[] = [];
  const hasEdits = (i: number) => lifted[i]!.overrides.length > 0 || lifted[i]!.foreign.length > 0;
  // A new first slide goes where the deck starts.
  const firstAt = pages.findIndex((p) => p.id === members[0]!.page.id);
  let anchor: string | null = firstAt > 0 ? pages[firstAt - 1]!.id : null;
  placed.forEach(({ member, filled, lateLost }, k) => {
    const composedSlide = composed.slides[k]!;
    const freshInput = oneSlide(fresh, k);
    // A page paired only by position shows another slide now: its edits do not fit.
    const keep = member !== null && !filled;
    const page = keep
      ? recomposePage(
          composedSlide,
          lifted[member]!.overrides,
          lifted[member]!.foreign,
          oneSlide(previous, member),
          freshInput,
          members[member]!.source.baseline
        )
      : recomposePage(composedSlide, [], [], freshInput, freshInput);
    dropped.push(...page.droppedOverrides);
    if (member !== null && filled && (hasEdits(member) || lateLost)) {
      rewrittenSlides.push(member + 1);
    }
    const source: SharepicSource = {
      v: 1,
      deck,
      slide: oneSlide(next, k),
      attribution: credits[k] ?? null,
      ...(Object.keys(tweaks).length > 0 && { tweaks }),
      baseline: page.baseline,
    };
    const state = { ...page.state, [SHAREPIC_SOURCE_KEY]: source };
    if (member !== null) {
      const pageId = members[member]!.page.id;
      ops.updates.push({ pageId, state });
      anchor = pageId;
    } else {
      // Chained anchors keep added slides in order.
      const pageId = deps.newPageId();
      ops.inserts.push({ afterPageId: anchor, pageId, configId: members[0]!.page.configId, state });
      anchor = pageId;
    }
  });
  const used = new Set(placed.map((p) => p.member));
  const sentIds = new Set(input.sent.pageIds);
  const removedSlides: number[] = [];
  members.forEach((m, i) => {
    // A page added while the model worked was never part of the request: left alone.
    if (used.has(i) || !sentIds.has(m.page.id)) return;
    ops.removes.push(m.page.id);
    if (hasEdits(i)) removedSlides.push(i + 1);
  });
  deps.replaceDeck(ops);
  return {
    status: 'applied',
    dropped,
    removedSlides,
    rewrittenSlides,
    overruled,
    replaced,
    hinweis: input.sharepic.hinweis ?? null,
    hinweise: revised.hinweise,
    ownPhotoReplaced: ownPhotoReplaced(sentSlides, revised.spec.slides, match),
    slideCount: placed.length,
  };
}

// ── what the person reads ───────────────────────────────────────────────────

/**
 * Fields whose item name misleads: live, the line under a big figure was
 * reported as "Zahl" while the person saw it as the headline.
 */
const FIELD_LABEL: Partial<Record<string, string>> = {
  'zahl.label': 'Text zur Zahl',
  'zitat.name': 'Name zum Zitat',
  'zitat.funktion': 'Funktion zum Zitat',
  'zitat.quelle': 'Quelle zum Zitat',
};

const quoted = (text: string) => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return `„${flat.length > 60 ? `${flat.slice(0, 59)}…` : flat}“`;
};

/** A hand text by the field it sits in and its words, e.g. Überschrift „Klimaschutz jetzt“. */
function textLabel(type: SharepicItem['type'] | null, path: string, text: string): string {
  if (!type) return `Folientext ${quoted(text)}`;
  const name = FIELD_LABEL[`${type}.${path.split('.')[0]}`] ?? SHAREPIC_ITEM_LABELS[type];
  return `${name} ${quoted(text)}`;
}

const overrideLabel = (o: Exclude<SharepicOverride, { kind: 'background' }>): string =>
  o.key.itemType ? SHAREPIC_ITEM_LABELS[o.key.itemType] : 'Seitenelement';

const list = (labels: string[]) => [...new Set(labels)].join(', ');

/** The model swapped the person's own photo; the draft keeps it, but the review or an old server may not. */
function ownPhotoLines(slides: number[], slideCount: number): string[] {
  if (slideCount === 1 && slides.length > 0) {
    return ['Dein eigenes Foto wurde ersetzt – „Verwerfen“ holt es zurück.'];
  }
  return slides.map(
    (k) => `Dein eigenes Foto auf Folie ${k} wurde ersetzt – „Verwerfen“ holt es zurück.`
  );
}

/** The status line after a spec edit; null when every hand edit was kept and the review was quiet. */
export function describeSpecEdit(result: AppliedSpecEdit): string | null {
  const moves: string[] = [];
  const others: string[] = [];
  const replaced = [...result.replaced];
  let background = false;
  for (const o of result.dropped) {
    if (o.kind === 'background') background = true;
    // A hand text on an item the spec rewrote: the requested change took its place.
    else if (o.kind === 'text') {
      replaced.push(
        o.key.itemType
          ? textLabel(o.key.itemType, o.key.role.replace(/^\*-?/, ''), o.text)
          : `Seitenelement ${quoted(o.text)}`
      );
    } else if (o.kind === 'style' && ('x' in o.props || 'y' in o.props))
      moves.push(overrideLabel(o));
    else others.push(overrideLabel(o));
  }
  const lines = [
    result.hinweis,
    ...ownPhotoLines(result.ownPhotoReplaced, result.slideCount),
    moves.length > 0 && `Deine Verschiebung von ${list(moves)} ließ sich nicht übernehmen.`,
    others.length > 0 && `Deine Änderung an ${list(others)} ließ sich nicht übernehmen.`,
    background && 'Deine Änderung am Hintergrund ließ sich nicht übernehmen.',
    ...result.removedSlides.map(
      (k) => `Folie ${k} entfernt – deine Änderungen darauf wurden verworfen.`
    ),
    ...result.rewrittenSlides.map(
      (k) => `Folie ${k} neu geschrieben – deine Änderungen darauf wurden verworfen.`
    ),
    replaced.length > 0 &&
      `Deine Textänderung an ${list(replaced)} wurde durch die gewünschte Änderung ersetzt.`,
    result.overruled.length > 0 &&
      `Deine Textänderung an ${list(result.overruled)} während der Überarbeitung wurde überschrieben.`,
    result.hinweise.length > 0 && `Hinweise der Prüfung: ${result.hinweise.join(' · ')}`,
  ].filter((line): line is string => !!line);
  return lines.length > 0 ? lines.join(' ') : null;
}
