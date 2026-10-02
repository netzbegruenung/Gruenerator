import { type Flux3Bbox, type KiLabelMode } from '@gruenerator/contracts';
import { type ImageFormatId, type KiStyleVariant } from '@gruenerator/shared/image-studio';

/** Composer modes. `erstellen` and `sharepic` need no image; the rest operate
 *  on the active version and are only offered once an image exists. `sharepic`
 *  hands the prompt to the Freitext-Sharepic-Creator. */
export type BevMode =
  | 'erstellen'
  | 'sharepic'
  | 'bearbeiten'
  | 'boxen'
  | 'gruen-verwandeln'
  | 'vergroessern'
  | 'hintergrund';

export type BevVersionKind = 'create' | 'edit' | 'green' | 'outpaint' | 'nobg' | 'upload';

/** A single node in the version tree. `parentId` links an edit/green/outpaint
 *  back to the version it derived from — siblings under one parent form a branch. */
export interface BevVersion {
  id: string;
  parentId: string | null;
  prompt: string;
  image: string; // data-URL
  time: number;
  num: number;
  kind: BevVersionKind;
}

export interface BevSettings {
  variant: KiStyleVariant;
  kiLabel: KiLabelMode;
  /** Output format of a newly created image („Erstellen"). */
  format: ImageFormatId;
  /** Target format of the „Vergrößern" (outpaint) mode. */
  aspect: ImageFormatId;
  /** Experimental (FLUX 3): plan a bounding-box layout before „Erstellen". */
  layout?: boolean;
  /** Experimental (FLUX 3): let the server edit box by box in „Bearbeiten". */
  autoBoxes?: boolean;
}

export type BevBoxAction = 'keep' | 'change' | 'remove';

/** One element in the „Boxen" mode. A box with `source: null` was added by
 *  the user; one whose `bbox` differs from `source` was moved. */
export interface BevBox {
  id: string;
  /** Where the element should end up, on BFL's 0–1000 grid, y first. */
  bbox: Flux3Bbox;
  /** Where it is in the image; null for a new element. */
  source: Flux3Bbox | null;
  /** What the element looks like now (from detection). */
  desc: string;
  action: BevBoxAction;
  /** What it should look like after the edit (action `change`, or a new box). */
  change: string;
}
