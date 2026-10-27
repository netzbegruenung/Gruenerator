/**
 * Balken — the data of a bar group on the canvas: one or three skewed bars
 * with a text each. The kind's slot (`balkenInstances`, its actions) is the
 * editor's; how a group looks is supplied by the host as a kind renderer
 * (`registerKindRenderers`), and its presets live with the host's brand.
 */

export type BalkenMode = 'single' | 'triple';

export interface BalkenInstance {
  id: string;
  mode: BalkenMode;
  colorSchemeId: string;
  widthScale: number;
  offset: { x: number; y: number };
  scale: number;
  texts: string[];
  rotation: number;
  opacity?: number;
  barOffsets?: [number, number, number];
}
