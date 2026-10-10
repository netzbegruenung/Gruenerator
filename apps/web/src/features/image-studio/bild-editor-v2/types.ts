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
