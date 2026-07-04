import {
  PRESENTATION_YDOC_KEYS,
  type Slide,
  type SlideLayout,
  type SlideTransition,
} from '@gruenerator/contracts';
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

export function getSlidesArray(ydoc: Y.Doc): Y.Array<Y.Map<unknown>> {
  return ydoc.getArray<Y.Map<unknown>>(PRESENTATION_YDOC_KEYS.slides);
}

export function getMetaMap(ydoc: Y.Doc): Y.Map<unknown> {
  return ydoc.getMap(PRESENTATION_YDOC_KEYS.meta);
}

export function newSlideId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `sl_${Math.random().toString(36).slice(2)}`;
}

export function yMapToSlide(m: Y.Map<unknown>): Slide {
  return {
    id: String(m.get('id') ?? ''),
    layout: (m.get('layout') as SlideLayout) ?? 'content',
    title: String(m.get('title') ?? ''),
    body: String(m.get('body') ?? ''),
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

export function slideToYMap(slide: Slide): Y.Map<unknown> {
  const m = new Y.Map<unknown>();
  m.set('id', slide.id);
  m.set('layout', slide.layout);
  m.set('title', slide.title);
  m.set('body', slide.body);
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

/** Yjs has no move op — a moved slide is a fresh clone (never re-insert a live
 * Y.Map instance, which throws). */
export function cloneSlideMap(m: Y.Map<unknown>): Y.Map<unknown> {
  return slideToYMap(yMapToSlide(m));
}

/** Clamp an insert index into [0, length]. */
export function clampInsert(index: number, length: number): number {
  return Math.min(Math.max(index, 0), length);
}
