/**
 * Bridge zwischen Harness-Seite und Playwright-Test. Eigenes Modul, damit der
 * Spec die Typen bekommt, ohne die tsx (und damit react-konva) zu importieren.
 */
export interface HarnessBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HarnessShape {
  id: string;
  type: string;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
}

export interface ShapeHarness {
  /** Der aktuelle Zustand der Form — dasselbe Objekt, das der Editor speichern würde. */
  shape: HarnessShape;
  /** Seitenkoordinaten eines Transformer-Ankers, z. B. 'bottom-right'. */
  anchorPos: (name: string) => { x: number; y: number } | null;
  /** Die gerenderte Bounding-Box der Form in Seitenkoordinaten. */
  renderedBox: () => HarnessBox | null;
}

declare global {
  interface Window {
    __shapeHarness?: ShapeHarness;
  }
}
