import {
  PRESENTATION_YDOC_KEYS,
  type Slide,
  type SlideLayout,
  type SlideTransition,
} from '@gruenerator/contracts';
import {
  bodyFragmentKey,
  fragmentToMarkdown,
  seedFragmentFromMarkdown,
} from '@gruenerator/contracts/presentations-richtext';
import * as Y from 'yjs';

export {
  PRESENTATION_YDOC_KEYS,
  PRESENTATION_META_KEYS,
  PRESENTATION_SCHEMA_VERSION,
} from '@gruenerator/contracts';

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
