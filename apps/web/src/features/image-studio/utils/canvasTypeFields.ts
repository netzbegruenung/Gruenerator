/**
 * Studio-facing view of the canvas template field map.
 *
 * The map itself now lives in `@gruenerator/contracts`
 * (`schemas/canvasTemplateFields.ts`) so the API chat path and the chat UI read
 * the same field lists, image keys and labels the studio does. This module stays
 * as the studio's import site — `canvasMintService` consumes it to mint a
 * collaborative canvas document (the only canvas-editing route,
 * `/studio/canvas/:id`), and `useStepFlow` consumes `isMintableCanvasType` to
 * decide, when the wizard reaches its canvas-edit step, whether to hand off to
 * the collaborative editor.
 *
 * Keys are studio type ids (`IMAGE_STUDIO_TYPES`) which, for every entry, equal
 * the canvas-editor config id (see `configLoader.ts`). Types absent from the map
 * (e.g. `presentation`, a multi-slide `pres-*` config) are not single-document
 * mintable and are intentionally left out.
 */
export {
  CANVAS_TEMPLATE_FIELDS as CANVAS_TYPE_FIELDS,
  getCanvasTypeFields,
  isMintableCanvasType,
  type CanvasFormField,
  type CanvasTypeFields,
} from '@gruenerator/contracts';
