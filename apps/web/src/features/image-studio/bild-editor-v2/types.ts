import { type KiLabelMode } from '@gruenerator/contracts';
import { type ImageFormatId, type KiStyleVariant } from '@gruenerator/shared/image-studio';

/** Composer modes. `erstellen` needs no image; the rest operate on the active
 *  version and are only offered once an image exists. */
export type BevMode =
  'erstellen' | 'bearbeiten' | 'gruen-verwandeln' | 'vergroessern' | 'hintergrund';

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
}
