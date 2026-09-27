/**
 * useGeometryReporter - meldet die gerenderte Geometrie eines Elements an den Store.
 *
 * Snap-Ziele standen bisher nur in `elementPositions`, wenn ein Element schon
 * einmal gezogen worden war — auf einem frisch erzeugten Sharepic war die Liste
 * also leer und es gab beim Ziehen ausser dem Mitten-Snap keine Hilfslinien.
 * Jedes Primitive meldet seine Masse deshalb nach dem Rendern hierher.
 *
 * Der Rückgabewert ist stabil und verwirft Meldungen, die nichts ändern — der
 * Store-Schreibvorgang darf pro Frame nicht mehrfach anfallen.
 */

import { useCallback, useRef } from 'react';

export type GeometryReporter = (
  id: string,
  x: number,
  y: number,
  width: number,
  height: number
) => void;

/** Sub-Pixel-Rauschen (Konva misst Text in Fliesskommawerten) ist keine Änderung. */
const GEOMETRY_EPSILON = 0.5;

export type Geometry = [x: number, y: number, width: number, height: number];

/**
 * Ist die neue Geometrie meldenswert? Nicht meldenswert sind unbrauchbare Werte
 * (noch nicht gemessen, Bild noch nicht geladen) und Sub-Pixel-Rauschen.
 */
export function isReportableGeometry(previous: Geometry | null, next: Geometry): boolean {
  const [x, y, width, height] = next;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (!(width > 0) || !(height > 0)) return false;
  if (!previous) return true;

  return previous.some((value, index) => Math.abs(value - next[index]!) >= GEOMETRY_EPSILON);
}

export function useGeometryReporter(
  id: string | undefined,
  report: GeometryReporter | undefined
): (x: number, y: number, width: number, height: number) => void {
  const lastRef = useRef<Geometry | null>(null);

  return useCallback(
    (x: number, y: number, width: number, height: number) => {
      if (!id || !report) return;

      const next: Geometry = [x, y, width, height];
      if (!isReportableGeometry(lastRef.current, next)) return;

      lastRef.current = next;
      report(id, x, y, width, height);
    },
    [id, report]
  );
}
