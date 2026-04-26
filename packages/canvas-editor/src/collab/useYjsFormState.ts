import { useCallback, useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';

import { YDOC_KEYS } from './ydocKeys';

const LOCAL_ORIGIN = Symbol('canvas-editor-form-local');

type FormState = Record<string, unknown>;

interface Options {
  ydoc: Y.Doc | null;
  isSynced: boolean;
  fallback: FormState;
}

interface Result {
  formState: FormState;
  updateFormState: (changes: Partial<FormState>) => void;
}

export function useYjsFormState({ ydoc, isSynced, fallback }: Options): Result {
  const [localFallback, setLocalFallback] = useState<FormState>(fallback);
  const [yState, setYState] = useState<FormState>(fallback);
  const seededRef = useRef(false);
  // Held in a ref so identity changes from a fresh `initialState` literal
  // every render don't tear down + re-register the observer below.
  const fallbackRef = useRef(fallback);
  fallbackRef.current = fallback;

  useEffect(() => {
    if (!ydoc || !isSynced) return undefined;
    const yMap = ydoc.getMap<unknown>(YDOC_KEYS.formState);

    const apply = () => {
      const next: FormState = {};
      yMap.forEach((value, key) => {
        next[key] = value;
      });
      setYState(next);
    };

    if (!seededRef.current && yMap.size === 0) {
      seededRef.current = true;
      ydoc.transact(() => {
        for (const [k, v] of Object.entries(fallbackRef.current)) {
          if (yMap.get(k) === undefined) yMap.set(k, v);
        }
      }, LOCAL_ORIGIN);
    }

    apply();
    yMap.observe(apply);
    return () => {
      yMap.unobserve(apply);
    };
  }, [ydoc, isSynced]);

  const updateFormState = useCallback(
    (changes: Partial<FormState>) => {
      if (!ydoc || !isSynced) {
        setLocalFallback((prev) => ({ ...prev, ...changes }));
        return;
      }
      const yMap = ydoc.getMap<unknown>(YDOC_KEYS.formState);
      ydoc.transact(() => {
        for (const [k, v] of Object.entries(changes)) {
          yMap.set(k, v);
        }
      }, LOCAL_ORIGIN);
    },
    [ydoc, isSynced]
  );

  return {
    formState: ydoc && isSynced ? yState : localFallback,
    updateFormState,
  };
}
