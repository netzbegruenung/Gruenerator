/**
 * Writes the Hocuspocus internal API refused on purpose. Kept apart from `canvasStateService`
 * (which opens a database handle) so a caller can test `instanceof` without loading it.
 */

/**
 * A write Hocuspocus refused on purpose. Retrying changes nothing, and the Y.Doc is the
 * authority, so none of these may be answered by patching the JSON mirror or by the
 * Hocuspocus-down fallback: every caller sees them as errors.
 */
export class CanvasWriteRefusedError extends Error {}

/**
 * Hocuspocus refused to write into a canvas document that is newer than it knows
 * (`meta.schemaVersion` or a kind version above its own, or malformed). The Y.Doc is the
 * authority and the next open reads it, not `canvas_documents.initial_state`: answering this by
 * patching that JSON mirror would leave the edit in one copy only. So it is never caught into
 * the Hocuspocus-down fallback below; every caller sees it as an error. The message is a
 * sentence a user may read (see `utils/errors/userFacing.ts`).
 */
export class CanvasDocumentNewerError extends CanvasWriteRefusedError {
  constructor(readonly canvasId: string) {
    super(
      'Dieser Canvas nutzt ein neueres Format, als der Server derzeit bearbeiten kann. ' +
        'Die Änderung wurde nicht gespeichert, im Chat lässt er sich vorerst nicht ändern.'
    );
    this.name = 'CanvasDocumentNewerError';
  }
}

/**
 * Hocuspocus refused a value the canvas codec cannot store (HTTP 400; nothing was written).
 * Usually generated content, e.g. a list with a repeated element id.
 */
export class CanvasStateUnwritableError extends CanvasWriteRefusedError {
  constructor(readonly canvasId: string) {
    super(
      'Die Änderung enthält einen Wert, den der Canvas nicht speichern kann. ' +
        'Sie wurde nicht gespeichert.'
    );
    this.name = 'CanvasStateUnwritableError';
  }
}
