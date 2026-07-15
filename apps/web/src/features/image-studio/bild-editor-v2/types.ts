import { type KiLabelMode } from '@gruenerator/contracts';
import { type KiStyleVariant } from '@gruenerator/shared/image-studio';

/** The composer is contextual and locked: no image → „Erstellen"; once an image
 *  exists → „Bearbeiten" only (the user resets to start over). */
export type BevMode = 'erstellen' | 'bearbeiten';

export type BevVersionKind = 'create' | 'edit' | 'upload';

/** A single node in the version tree. `parentId` links an edit back to the
 *  version it derived from — siblings under one parent form a branch. */
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
}
