import { describe, expect, it } from 'vitest';

import { GENERIC_ERROR_MESSAGE, toUserFacingMessage } from './userFacing.js';

describe('toUserFacingMessage', () => {
  it('passes an authored sentence through, lowercase e-words included', () => {
    const message =
      'Das Kontingent lässt sich gerade nicht prüfen. Bitte versuch es gleich noch einmal.';
    expect(toUserFacingMessage(new Error(message))).toBe(message);
  });

  it('treats a Node errno code as technical', () => {
    expect(toUserFacingMessage(new Error('write EPIPE'))).toBe(GENERIC_ERROR_MESSAGE);
  });
});
