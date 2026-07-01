/**
 * Single source of truth for "which store fields + image seed each canvas
 * template type into its `initial_state`".
 *
 * This replaces two former duplicate encodings:
 *  - `CANVAS_BLOCK_CONFIGS` in the deleted inline `CanvasEditStep`, and
 *  - the per-type `switch` in `canvasMintService.buildInitialState`.
 *
 * `canvasMintService` consumes this map to mint a collaborative canvas document
 * (the only canvas-editing route, `/studio/canvas/:id`). `useStepFlow` consumes
 * `isMintableCanvasType` to decide, when the wizard reaches its canvas-edit step,
 * whether to hand off to the collaborative editor.
 *
 * Keys are studio type ids (`IMAGE_STUDIO_TYPES`) which, for every entry here,
 * equal the canvas-editor config id (see `configLoader.ts`). Types absent from
 * this map (e.g. `presentation`, which is a multi-slide `pres-*` config) are not
 * single-document mintable and are intentionally left out.
 */
import { type CanvasTemplateType } from '@gruenerator/contracts';

import { IMAGE_STUDIO_TYPES } from './typeConfig';

/** Store fields that can seed a canvas `initial_state`. */
export type CanvasFormField =
  | 'line1'
  | 'line2'
  | 'line3'
  | 'quote'
  | 'name'
  | 'header'
  | 'body'
  | 'headline'
  | 'subtext'
  | 'label'
  | 'eventTitle'
  | 'beschreibung'
  | 'weekday'
  | 'date'
  | 'time'
  | 'locationName'
  | 'address';

interface CanvasImageConfig {
  /** Key under which the resolved (uploaded) image URL is written into `initial_state`. */
  key: string;
  /** Where the source image comes from in the studio store. */
  source: 'upload' | 'transparent';
  /** Whether the template cannot render without the image. */
  required: boolean;
}

export interface CanvasTypeFields {
  fields: readonly CanvasFormField[];
  image?: CanvasImageConfig;
}

export const CANVAS_TYPE_FIELDS = {
  [IMAGE_STUDIO_TYPES.DREIZEILEN]: {
    fields: ['line1', 'line2', 'line3'],
    image: { key: 'currentImageSrc', source: 'upload', required: false },
  },
  [IMAGE_STUDIO_TYPES.ZITAT]: {
    fields: ['quote', 'name'],
    image: { key: 'imageSrc', source: 'upload', required: true },
  },
  [IMAGE_STUDIO_TYPES.ZITAT_PURE]: {
    fields: ['quote', 'name'],
  },
  [IMAGE_STUDIO_TYPES.INFO]: {
    fields: ['header', 'body'],
  },
  [IMAGE_STUDIO_TYPES.VERANSTALTUNG]: {
    fields: ['eventTitle', 'beschreibung', 'weekday', 'date', 'time', 'locationName', 'address'],
    image: { key: 'imageSrc', source: 'upload', required: true },
  },
  [IMAGE_STUDIO_TYPES.VERANSTALTUNG_PLAKAT]: {
    fields: ['eventTitle', 'beschreibung', 'weekday', 'date', 'time', 'locationName', 'address'],
    image: { key: 'imageSrc', source: 'upload', required: true },
  },
  [IMAGE_STUDIO_TYPES.SIMPLE]: {
    fields: ['headline', 'subtext'],
    image: { key: 'imageSrc', source: 'upload', required: true },
  },
  [IMAGE_STUDIO_TYPES.SLIDER]: {
    fields: ['label', 'headline', 'subtext'],
  },
  [IMAGE_STUDIO_TYPES.PROFILBILD]: {
    fields: [],
    image: { key: 'transparentImage', source: 'transparent', required: true },
  },
  [IMAGE_STUDIO_TYPES.FREEFORM]: {
    fields: [],
  },
  // `Record<CanvasTemplateType, …>` (NOT Partial) ties these keys to the
  // canonical enum: adding a mintable type without adding it to
  // CANVAS_TEMPLATE_TYPES — or vice versa — is a compile error. This keeps
  // `isMintableCanvasType`'s `type is CanvasTemplateType` narrowing sound.
} satisfies Record<CanvasTemplateType, CanvasTypeFields>;

/**
 * Studio types that can be minted into a single collaborative canvas document.
 * Type guard: narrows to `CanvasTemplateType` (the mintable set equals the
 * canonical canvas-template enum), so `mintCanvasFromStudioStore` passes a
 * validated `template_type` by construction.
 */
export function isMintableCanvasType(type: string): type is CanvasTemplateType {
  return Object.prototype.hasOwnProperty.call(CANVAS_TYPE_FIELDS, type);
}

export function getCanvasTypeFields(type: string): CanvasTypeFields | null {
  return isMintableCanvasType(type)
    ? CANVAS_TYPE_FIELDS[type as keyof typeof CANVAS_TYPE_FIELDS]
    : null;
}
