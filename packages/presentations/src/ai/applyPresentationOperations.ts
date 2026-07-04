import { type PresentationOperation, type Slide } from '@gruenerator/contracts';
import * as Y from 'yjs';

import {
  clampInsert,
  cloneSlideMap,
  getMetaMap,
  getSlidesArray,
  newSlideId,
  PRESENTATION_LOCAL_ORIGIN,
  PRESENTATION_META_KEYS,
  slideToYMap,
} from '../lib/ydocSchema.js';

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
            };
            const idx = op.at != null ? clampInsert(op.at - 1, arr.length) : arr.length;
            arr.insert(idx, [slideToYMap(slide)]);
            applied += 1;
            break;
          }
          case 'update_slide': {
            const m = arr.get(op.slide - 1);
            if (!m) {
              skipped.push(`Folie ${op.slide} existiert nicht.`);
              break;
            }
            if (op.title != null) m.set('title', op.title);
            if (op.body != null) m.set('body', op.body);
            if (op.notes != null) m.set('notes', op.notes);
            if (op.layout != null) m.set('layout', op.layout);
            if (op.background !== undefined) m.set('background', op.background ?? null);
            if (op.transition !== undefined) m.set('transition', op.transition ?? null);
            if (op.fragments != null) m.set('fragments', op.fragments);
            if (op.autoAnimate != null) m.set('autoAnimate', op.autoAnimate);
            if (op.hidden != null) m.set('hidden', op.hidden);
            if (op.codeLanguage !== undefined) m.set('codeLanguage', op.codeLanguage ?? null);
            applied += 1;
            break;
          }
          case 'delete_slide': {
            const idx = op.slide - 1;
            if (idx < 0 || idx >= arr.length) {
              skipped.push(`Folie ${op.slide} existiert nicht.`);
              break;
            }
            arr.delete(idx, 1);
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
