/**
 * Y.Doc helpers and the AI-op applier for reveal.js presentation decks.
 *
 * Subpath export ONLY (`@gruenerator/contracts/presentations-ops`), like
 * `presentations-richtext` it builds on: the editor (`packages/presentations`)
 * applies ops on its live doc, the API applies the same ops on a doc it loaded
 * from Hocuspocus — one applier, not two that drift.
 */
import * as Y from 'yjs';

import { PRESENTATION_META_KEYS, PRESENTATION_YDOC_KEYS } from '../presentationsYdoc.js';
import {
  type PresentationOperation,
  type Slide,
  type SlideFontSize,
  type SlideLayout,
  type SlideTransition,
} from '../schemas/presentations.js';

import { bodyFragmentKey, fragmentToMarkdown, seedFragmentFromMarkdown } from './slideBody.js';

/** Transaction origins so the UndoManager tracks only local + AI edits (not
 * remote peers) and the seed guard is distinguishable. */
export const PRESENTATION_LOCAL_ORIGIN = 'presentation-local';
export const PRESENTATION_SEED_ORIGIN = 'presentation-seed';

/** Code slides keep their body as a plain string (source code isn't rich text);
 * every other layout edits its body collaboratively in a Y.XmlFragment. */
export function isCodeLayout(layout: SlideLayout): boolean {
  return layout === 'code';
}

export function getSlidesArray(ydoc: Y.Doc): Y.Array<Y.Map<unknown>> {
  return ydoc.getArray<Y.Map<unknown>>(PRESENTATION_YDOC_KEYS.slides);
}

export function getMetaMap(ydoc: Y.Doc): Y.Map<unknown> {
  return ydoc.getMap(PRESENTATION_YDOC_KEYS.meta);
}

/** The top-level collaborative body fragment for a slide id. */
export function getBodyFragment(ydoc: Y.Doc, slideId: string): Y.XmlFragment {
  return ydoc.getXmlFragment(bodyFragmentKey(slideId));
}

export function newSlideId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `sl_${Math.random().toString(36).slice(2)}`;
}

/** Derive a plain Slide (markdown `body`) from its Y.Map + body fragment. */
export function yMapToSlide(m: Y.Map<unknown>, ydoc: Y.Doc): Slide {
  const id = String(m.get('id') ?? '');
  const layout = (m.get('layout') as SlideLayout) ?? 'content';
  const body = isCodeLayout(layout)
    ? String(m.get('body') ?? '')
    : fragmentToMarkdown(getBodyFragment(ydoc, id));
  return {
    id,
    layout,
    title: String(m.get('title') ?? ''),
    body,
    notes: String(m.get('notes') ?? ''),
    background: (m.get('background') as string | null) ?? null,
    transition: (m.get('transition') as SlideTransition | null) ?? null,
    fragments: Boolean(m.get('fragments') ?? false),
    autoAnimate: Boolean(m.get('autoAnimate') ?? false),
    hidden: Boolean(m.get('hidden') ?? false),
    codeLanguage: (m.get('codeLanguage') as string | null) ?? null,
    variant: Number(m.get('variant') ?? 0),
    fontSize: (m.get('fontSize') as SlideFontSize | null) ?? null,
  };
}

/** Build a slide Y.Map. Non-code bodies live in a fragment (see
 * `seedSlideBody`), so only code layouts store a `body` string here. */
export function slideToYMap(slide: Slide): Y.Map<unknown> {
  const m = new Y.Map<unknown>();
  m.set('id', slide.id);
  m.set('layout', slide.layout);
  m.set('title', slide.title);
  if (isCodeLayout(slide.layout)) m.set('body', slide.body);
  m.set('notes', slide.notes);
  m.set('background', slide.background ?? null);
  m.set('transition', slide.transition ?? null);
  m.set('fragments', slide.fragments ?? false);
  m.set('autoAnimate', slide.autoAnimate ?? false);
  m.set('hidden', slide.hidden ?? false);
  m.set('codeLanguage', slide.codeLanguage ?? null);
  m.set('variant', slide.variant ?? 0);
  m.set('fontSize', slide.fontSize ?? null);
  return m;
}

/** Seed a new slide's collaborative body fragment from its markdown (non-code
 * only). Call inside the same transaction that inserts the map. */
export function seedSlideBody(ydoc: Y.Doc, slide: Slide): void {
  if (isCodeLayout(slide.layout)) return;
  if (!slide.body) return;
  seedFragmentFromMarkdown(getBodyFragment(ydoc, slide.id), slide.body);
}

/** Write a slide's body markdown to the right place for its layout: a string
 * for code, the collaborative fragment otherwise. Must run inside a transact. */
export function writeSlideBody(
  ydoc: Y.Doc,
  m: Y.Map<unknown>,
  id: string,
  layout: SlideLayout,
  markdown: string
): void {
  if (isCodeLayout(layout)) m.set('body', markdown);
  else seedFragmentFromMarkdown(getBodyFragment(ydoc, id), markdown);
}

/** Move the body between the string field and the fragment when a layout change
 * crosses the code boundary. No-op when it doesn't. Must run inside a transact. */
export function migrateSlideBodyForLayout(
  ydoc: Y.Doc,
  m: Y.Map<unknown>,
  id: string,
  prevLayout: SlideLayout,
  nextLayout: SlideLayout,
  explicitBody?: string
): void {
  const wasCode = isCodeLayout(prevLayout);
  const willCode = isCodeLayout(nextLayout);
  if (wasCode === willCode) return;
  if (willCode) {
    const md = explicitBody ?? fragmentToMarkdown(getBodyFragment(ydoc, id));
    clearSlideBody(ydoc, id);
    m.set('body', md);
  } else {
    const src = explicitBody ?? String(m.get('body') ?? '');
    m.delete('body');
    seedFragmentFromMarkdown(getBodyFragment(ydoc, id), src);
  }
}

/** Empty a deleted slide's body fragment (a top-level type can't be removed,
 * but clearing its content reclaims the space and avoids stale reuse). */
export function clearSlideBody(ydoc: Y.Doc, slideId: string): void {
  const frag = getBodyFragment(ydoc, slideId);
  if (frag.length) frag.delete(0, frag.length);
}

/** Yjs has no move op — a moved slide is a fresh clone of its primitive fields.
 * The body fragment is top-level (keyed by the stable slide id), so it stays
 * put across the move; nothing to clone there. */
export function cloneSlideMap(m: Y.Map<unknown>): Y.Map<unknown> {
  const clone = new Y.Map<unknown>();
  m.forEach((value, key) => clone.set(key, value));
  return clone;
}

/** Clamp an insert index into [0, length]. */
export function clampInsert(index: number, length: number): number {
  return Math.min(Math.max(index, 0), length);
}

export interface ApplyResult {
  applied: number;
  /** German reasons for each skipped op (surfaced in a toast). */
  skipped: string[];
}

/**
 * Apply AI-planned operations to the deck's Y.Doc in a single tracked
 * transaction (so undo reverts the whole batch). Slides are addressed by
 * 1-based number, matching the serialized context. Each op is guarded — a bad
 * op is skipped with a reason, never aborting the batch. Mirrors
 * applySheetOperations.
 */
export function applyPresentationOperations(
  ydoc: Y.Doc,
  operations: readonly PresentationOperation[]
): ApplyResult {
  const arr = getSlidesArray(ydoc);
  const meta = getMetaMap(ydoc);
  const skipped: string[] = [];
  let applied = 0;

  ydoc.transact(() => {
    for (const op of operations) {
      try {
        switch (op.type) {
          case 'add_slide': {
            const slide: Slide = {
              id: newSlideId(),
              layout: op.layout,
              title: op.title,
              body: op.body,
              notes: op.notes ?? '',
              background: null,
              transition: null,
              fragments: false,
              fontSize: op.fontSize && op.fontSize !== 'auto' ? op.fontSize : null,
            };
            const idx = op.at != null ? clampInsert(op.at - 1, arr.length) : arr.length;
            arr.insert(idx, [slideToYMap(slide)]);
            seedSlideBody(ydoc, slide);
            applied += 1;
            break;
          }
          case 'update_slide': {
            const m = arr.get(op.slide - 1);
            if (!m) {
              skipped.push(`Folie ${op.slide} existiert nicht.`);
              break;
            }
            // Patch semantics: only fields the model actually provided change.
            // A null (which models emit freely for "untouched") is treated as
            // "no change" for every field — consistent, and never accidentally
            // wipes a background/transition the user set.
            const id = String(m.get('id') ?? '');
            const prevLayout = (m.get('layout') as SlideLayout) ?? 'content';
            const nextLayout = (op.layout ?? prevLayout) as SlideLayout;
            if (op.layout != null) {
              migrateSlideBodyForLayout(ydoc, m, id, prevLayout, nextLayout, op.body ?? undefined);
            }
            if (op.body != null && prevLayout === nextLayout) {
              writeSlideBody(ydoc, m, id, nextLayout, op.body);
            }
            if (op.title != null) m.set('title', op.title);
            if (op.notes != null) m.set('notes', op.notes);
            if (op.layout != null) m.set('layout', op.layout);
            if (op.background != null) m.set('background', op.background);
            if (op.transition != null) m.set('transition', op.transition);
            if (op.fragments != null) m.set('fragments', op.fragments);
            if (op.autoAnimate != null) m.set('autoAnimate', op.autoAnimate);
            if (op.hidden != null) m.set('hidden', op.hidden);
            if (op.codeLanguage != null) m.set('codeLanguage', op.codeLanguage);
            if (op.variant != null) m.set('variant', op.variant);
            // 'auto' is the explicit reset literal — null would mean "no change".
            if (op.fontSize != null) {
              m.set('fontSize', op.fontSize === 'auto' ? null : op.fontSize);
            }
            applied += 1;
            break;
          }
          case 'delete_slide': {
            const idx = op.slide - 1;
            if (idx < 0 || idx >= arr.length) {
              skipped.push(`Folie ${op.slide} existiert nicht.`);
              break;
            }
            const id = String(arr.get(idx).get('id') ?? '');
            arr.delete(idx, 1);
            if (id) clearSlideBody(ydoc, id);
            applied += 1;
            break;
          }
          case 'move_slide': {
            const from = op.from - 1;
            if (from < 0 || from >= arr.length) {
              skipped.push(`Folie ${op.from} existiert nicht.`);
              break;
            }
            const clone = cloneSlideMap(arr.get(from));
            arr.delete(from, 1);
            arr.insert(clampInsert(op.to - 1, arr.length), [clone]);
            applied += 1;
            break;
          }
          case 'set_deck_option': {
            if (op.defaultTransition !== undefined) {
              meta.set(PRESENTATION_META_KEYS.defaultTransition, op.defaultTransition ?? null);
            }
            if (op.autoSlide !== undefined) {
              meta.set(PRESENTATION_META_KEYS.autoSlide, op.autoSlide ?? null);
            }
            if (op.loop != null) meta.set(PRESENTATION_META_KEYS.loop, op.loop);
            if (op.slideNumber != null)
              meta.set(PRESENTATION_META_KEYS.slideNumber, op.slideNumber);
            if (op.accentColor != null)
              meta.set(PRESENTATION_META_KEYS.accentColor, op.accentColor);
            applied += 1;
            break;
          }
        }
      } catch (err) {
        skipped.push(`Operation „${op.type}" fehlgeschlagen: ${(err as Error).message}`);
      }
    }
  }, PRESENTATION_LOCAL_ORIGIN);

  return { applied, skipped };
}
