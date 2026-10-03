import { describe, expect, it } from 'vitest';

import { CANVAS_FORMATS } from '../../../../packages/canvas-editor/src/formats/index.js';

import { SERVER_FORMATS } from './pageConstants.js';

describe('SERVER_FORMATS', () => {
  it('mirrors the canvas-editor format registry', () => {
    expect(SERVER_FORMATS).toEqual(
      Object.fromEntries(
        CANVAS_FORMATS.map(({ id, category, width, height, dpi }) => [
          id,
          { id, category, width, height, dpi },
        ])
      )
    );
  });
});
