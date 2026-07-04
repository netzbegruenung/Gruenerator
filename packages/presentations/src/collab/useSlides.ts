import {
  PRESENTATION_META_KEYS,
  PRESENTATION_SCHEMA_VERSION,
  type Slide,
  type SlideTransition,
} from '@gruenerator/contracts';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import * as Y from 'yjs';

import {
  clampInsert,
  cloneSlideMap,
  getMetaMap,
  getSlidesArray,
  newSlideId,
  PRESENTATION_LOCAL_ORIGIN,
  PRESENTATION_SEED_ORIGIN,
  slideToYMap,
  yMapToSlide,
} from '../lib/ydocSchema.js';

export interface DeckOptions {
  defaultTransition: SlideTransition | null;
  autoSlide: number | null;
  loop: boolean;
  slideNumber: boolean;
  /** Deck brand accent colour; null → the default (#316049). */
  accentColor: string | null;
}

export interface UseSlidesResult {
  slides: Slide[];
  deckOptions: DeckOptions;
  addSlide: (partial?: Partial<Slide>, at?: number) => string;
  updateSlide: (index: number, patch: Partial<Slide>) => void;
  deleteSlide: (index: number) => void;
  moveSlide: (from: number, to: number) => void;
  setDeckOption: (patch: Partial<DeckOptions>) => void;
  /** Seed the deck with `initial` slides once (guarded by the `seeded` flag). */
  seedIfNeeded: (initial: Slide[]) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

/**
 * The entire collab layer for a presentation: binds the shared Y.Doc's slide
 * array to React via useSyncExternalStore and exposes mutation helpers (each a
 * single tracked transaction) plus a scoped UndoManager. reveal.js never
 * touches the Y.Doc — it only renders the derived `slides`.
 */
export function useSlides(ydoc: Y.Doc): UseSlidesResult {
  const arr = useMemo(() => getSlidesArray(ydoc), [ydoc]);
  const meta = useMemo(() => getMetaMap(ydoc), [ydoc]);

  // Version counter bumped on any slide/meta change; getSnapshot caches the
  // derived array so identical reads return a stable reference.
  const versionRef = useRef(0);
  const cacheRef = useRef<{ version: number; slides: Slide[] }>({ version: -1, slides: [] });

  const subscribe = useCallback(
    (onChange: () => void) => {
      const handler = () => {
        versionRef.current += 1;
        onChange();
      };
      arr.observeDeep(handler);
      meta.observe(handler);
      return () => {
        arr.unobserveDeep(handler);
        meta.unobserve(handler);
      };
    },
    [arr, meta]
  );

  const getSlidesSnapshot = useCallback(() => {
    if (cacheRef.current.version !== versionRef.current) {
      cacheRef.current = {
        version: versionRef.current,
        slides: arr.toArray().map((m) => yMapToSlide(m)),
      };
    }
    return cacheRef.current.slides;
  }, [arr]);

  // Deck options are cached by version too, so the returned object is stable
  // between unrelated changes (avoids re-render loops via useSyncExternalStore).
  const deckCacheRef = useRef<{ version: number; opts: DeckOptions }>({
    version: -1,
    opts: {
      defaultTransition: null,
      autoSlide: null,
      loop: false,
      slideNumber: false,
      accentColor: null,
    },
  });
  const getDeckOptions = useCallback((): DeckOptions => {
    if (deckCacheRef.current.version !== versionRef.current) {
      deckCacheRef.current = {
        version: versionRef.current,
        opts: {
          defaultTransition:
            (meta.get(PRESENTATION_META_KEYS.defaultTransition) as SlideTransition | null) ?? null,
          autoSlide: (meta.get(PRESENTATION_META_KEYS.autoSlide) as number | null) ?? null,
          loop: Boolean(meta.get(PRESENTATION_META_KEYS.loop) ?? false),
          slideNumber: Boolean(meta.get(PRESENTATION_META_KEYS.slideNumber) ?? false),
          accentColor: (meta.get(PRESENTATION_META_KEYS.accentColor) as string | null) ?? null,
        },
      };
    }
    return deckCacheRef.current.opts;
  }, [meta]);

  const slides = useSyncExternalStore(subscribe, getSlidesSnapshot, getSlidesSnapshot);
  const deckOptions = useSyncExternalStore(subscribe, getDeckOptions, getDeckOptions);

  const addSlide = useCallback(
    (partial?: Partial<Slide>, at?: number): string => {
      const slide: Slide = {
        id: newSlideId(),
        layout: 'content',
        title: '',
        body: '',
        notes: '',
        background: null,
        transition: null,
        fragments: false,
        ...partial,
      };
      ydoc.transact(() => {
        const idx = at != null ? clampInsert(at, arr.length) : arr.length;
        arr.insert(idx, [slideToYMap(slide)]);
      }, PRESENTATION_LOCAL_ORIGIN);
      return slide.id;
    },
    [ydoc, arr]
  );

  const updateSlide = useCallback(
    (index: number, patch: Partial<Slide>) => {
      ydoc.transact(() => {
        const m = arr.get(index);
        if (!m) return;
        for (const [key, value] of Object.entries(patch)) {
          if (value !== undefined) m.set(key, value);
        }
      }, PRESENTATION_LOCAL_ORIGIN);
    },
    [ydoc, arr]
  );

  const deleteSlide = useCallback(
    (index: number) => {
      ydoc.transact(() => {
        if (index >= 0 && index < arr.length) arr.delete(index, 1);
      }, PRESENTATION_LOCAL_ORIGIN);
    },
    [ydoc, arr]
  );

  const moveSlide = useCallback(
    (from: number, to: number) => {
      ydoc.transact(() => {
        if (from < 0 || from >= arr.length) return;
        const clone = cloneSlideMap(arr.get(from));
        arr.delete(from, 1);
        arr.insert(clampInsert(to, arr.length), [clone]);
      }, PRESENTATION_LOCAL_ORIGIN);
    },
    [ydoc, arr]
  );

  const setDeckOption = useCallback(
    (patch: Partial<DeckOptions>) => {
      ydoc.transact(() => {
        if (patch.defaultTransition !== undefined)
          meta.set(PRESENTATION_META_KEYS.defaultTransition, patch.defaultTransition);
        if (patch.autoSlide !== undefined)
          meta.set(PRESENTATION_META_KEYS.autoSlide, patch.autoSlide);
        if (patch.loop !== undefined) meta.set(PRESENTATION_META_KEYS.loop, patch.loop);
        if (patch.slideNumber !== undefined)
          meta.set(PRESENTATION_META_KEYS.slideNumber, patch.slideNumber);
        if (patch.accentColor !== undefined)
          meta.set(PRESENTATION_META_KEYS.accentColor, patch.accentColor);
      }, PRESENTATION_LOCAL_ORIGIN);
    },
    [ydoc, meta]
  );

  const seedIfNeeded = useCallback(
    (initial: Slide[]) => {
      if (meta.get(PRESENTATION_META_KEYS.seeded) === true) return;
      ydoc.transact(() => {
        // Re-check inside the transaction: a concurrent tab may have seeded
        // between the guard and here. LWW on `seeded` keeps blank content equal.
        if (meta.get(PRESENTATION_META_KEYS.seeded) === true) return;
        if (arr.length === 0) arr.insert(0, initial.map(slideToYMap));
        meta.set(PRESENTATION_META_KEYS.seeded, true);
        meta.set(PRESENTATION_META_KEYS.schemaVersion, PRESENTATION_SCHEMA_VERSION);
      }, PRESENTATION_SEED_ORIGIN);
    },
    [ydoc, arr, meta]
  );

  // UndoManager scoped to the slide array, tracking only local + AI edits.
  const undoManager = useMemo(
    () => new Y.UndoManager(arr, { trackedOrigins: new Set([PRESENTATION_LOCAL_ORIGIN]) }),
    [arr]
  );
  const [undoState, setUndoState] = useState({ canUndo: false, canRedo: false });
  useEffect(() => {
    const update = () =>
      setUndoState({ canUndo: undoManager.canUndo(), canRedo: undoManager.canRedo() });
    undoManager.on('stack-item-added', update);
    undoManager.on('stack-item-popped', update);
    update();
    return () => {
      undoManager.off('stack-item-added', update);
      undoManager.off('stack-item-popped', update);
      undoManager.destroy();
    };
  }, [undoManager]);

  const undo = useCallback(() => undoManager.undo(), [undoManager]);
  const redo = useCallback(() => undoManager.redo(), [undoManager]);

  return {
    slides,
    deckOptions,
    addSlide,
    updateSlide,
    deleteSlide,
    moveSlide,
    setDeckOption,
    seedIfNeeded,
    undo,
    redo,
    canUndo: undoState.canUndo,
    canRedo: undoState.canRedo,
  };
}
