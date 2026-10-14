import { type Flux3Bbox } from '@gruenerator/contracts';

/** What the next chat message does: `erstellen` makes a new image (the Studio's request, or a
 *  retry when it failed), `bearbeiten` edits the image on the stage. */
export type BevMode = 'erstellen' | 'bearbeiten';

/** `green`, `outpaint` and `nobg` come from earlier editor modes; saved versions still carry them. */
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

export type BevBoxAction = 'keep' | 'change' | 'remove';

/** One element in the expert mode. A box with `source: null` was added by the user; one whose
 *  `bbox` differs from `source` was moved. */
export interface BevBox {
  id: string;
  /** Where the element should end up, on BFL's 0–1000 grid, y first. */
  bbox: Flux3Bbox;
  /** Where it is in the image; null for a new element. */
  source: Flux3Bbox | null;
  /** What the element looks like now (from detection, English for the image model). */
  desc: string;
  /** What the editor calls it (from detection, German); empty for a new element. */
  label: string;
  action: BevBoxAction;
  /** What it should look like after the edit (action `change`, or a new box). */
  change: string;
}
