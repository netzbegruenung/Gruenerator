import { type KiLabelMode } from '@gruenerator/contracts';
import { type KiStyleVariant } from '@gruenerator/shared/image-studio';

/**
 * Native port of the web Bild-Editor v2 types
 * (apps/web/src/features/image-studio/bild-editor-v2/types.ts).
 *
 * Composer modes: `erstellen` needs no image; the rest operate on the active
 * version and are only offered once an image exists.
 */
export type BevMode =
  | 'erstellen'
  | 'bearbeiten'
  | 'gruen-verwandeln'
  | 'vergroessern'
  | 'hintergrund';

export type BevVersionKind = 'create' | 'edit' | 'green' | 'outpaint' | 'nobg' | 'upload';

/**
 * A single node in the version tree. `parentId` links an edit/green/outpaint back
 * to the version it derived from — siblings under one parent form a branch.
 *
 * `image` is a local file URI (not a data URL, unlike web) so `expo-image`
 * renders it efficiently and it survives an app restart via AsyncStorage. `width`/
 * `height` are the source pixel dimensions, used for outpaint geometry and to
 * downscale edit references without re-decoding.
 */
export interface BevVersion {
  id: string;
  parentId: string | null;
  prompt: string;
  image: string;
  width: number;
  height: number;
  time: number;
  num: number;
  kind: BevVersionKind;
}

/** Aspect presets for the „Vergrößern" (outpaint) mode. */
export type BevAspect = '1:1' | '4:3' | '3:4' | '16:9' | '9:16';

export interface BevSettings {
  variant: KiStyleVariant;
  kiLabel: KiLabelMode;
  aspect: BevAspect;
}
