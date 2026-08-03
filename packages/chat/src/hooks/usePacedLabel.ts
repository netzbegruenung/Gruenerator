import { useEffect, useRef, useState } from 'react';
import { createPacedLabelController, type PacedLabelController } from '../lib/labelPacing';

/**
 * Paces a rapidly-changing status label so each value stays readable for at
 * least `minVisibleMs`, collapsing bursts to the latest. Thin wrapper around the
 * unit-tested `createPacedLabelController` (see labelPacing.vitest.ts).
 */
export function usePacedLabel(incoming: string, minVisibleMs = 900): string {
  const [visible, setVisible] = useState(incoming);
  const controllerRef = useRef<PacedLabelController | null>(null);

  if (controllerRef.current === null) {
    controllerRef.current = createPacedLabelController(incoming, setVisible, { minVisibleMs });
  }

  useEffect(() => {
    controllerRef.current?.push(incoming);
  }, [incoming]);

  useEffect(() => {
    return () => controllerRef.current?.dispose();
  }, []);

  return visible;
}
