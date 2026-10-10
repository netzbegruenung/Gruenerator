import { type KiLabelMode } from '@gruenerator/contracts';
import { type ImageFormatId } from '@gruenerator/shared/image-studio';

/** Composer modes. `erstellen` needs no image and only runs what the Studio handed over (or a
 *  retry when that failed); the rest operate on the active version. `profilbild` cuts the active
 *  photo out and opens it in the profile-picture canvas. */
export type BevMode =
  'erstellen' | 'bearbeiten' | 'gruen-verwandeln' | 'vergroessern' | 'hintergrund' | 'profilbild';

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
  kiLabel: KiLabelMode;
  /** Target format of the „Vergrößern" (outpaint) mode. */
  aspect: ImageFormatId;
}
