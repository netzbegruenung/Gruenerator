import { describe, expect, it } from 'vitest';

import { GENERIC_ERROR_MESSAGE, toUserFacingMessage } from './userFacing.js';

describe('toUserFacingMessage', () => {
  it('passes an authored sentence through, lowercase e-words included', () => {
    const message =
      'Das Kontingent lässt sich gerade nicht prüfen. Bitte versuch es gleich noch einmal.';
    expect(toUserFacingMessage(new Error(message))).toBe(message);
  });

  it('passes the canvas write refusals through unchanged', async () => {
    const {
      CanvasDocumentNewerError,
      CanvasDocumentNewerReadError,
      CanvasLiveStateUnavailableError,
      CanvasStateUnwritableError,
    } = await import('../../services/canvas/canvasWriteErrors.js');
    for (const error of [
      new CanvasDocumentNewerError('c1'),
      new CanvasDocumentNewerReadError('c1'),
      new CanvasLiveStateUnavailableError('c1'),
      new CanvasStateUnwritableError('c1'),
    ]) {
      expect(toUserFacingMessage(error)).toBe(error.message);
    }
  });

  it('treats a Node errno code as technical', () => {
    expect(toUserFacingMessage(new Error('write EPIPE'))).toBe(GENERIC_ERROR_MESSAGE);
  });
});
