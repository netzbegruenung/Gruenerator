import { useEffect, useRef, useState } from 'react';
import {
  createExitLatchController,
  type ExitLatchController,
  type ExitLatchState,
} from '../lib/labelPacing';

/**
 * Keeps a conditionally-rendered element mounted for `exitMs` after `active`
 * goes false so it can fade out instead of vanishing. Returns whether to render
 * and whether it is currently exiting (drives the fade-out class). Thin wrapper
 * around the unit-tested `createExitLatchController`.
 */
export function useDelayedUnmount(active: boolean, exitMs = 250): ExitLatchState {
  const [state, setState] = useState<ExitLatchState>({ mounted: active, exiting: false });
  const controllerRef = useRef<ExitLatchController | null>(null);

  if (controllerRef.current === null) {
    controllerRef.current = createExitLatchController(active, setState, { exitMs });
  }

  useEffect(() => {
    controllerRef.current?.set(active);
  }, [active]);

  useEffect(() => {
    return () => controllerRef.current?.dispose();
  }, []);

  return state;
}
