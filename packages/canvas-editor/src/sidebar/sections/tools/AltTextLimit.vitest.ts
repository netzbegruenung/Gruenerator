import { ALT_TEXT_MAX_CHARS } from '@ggraphic/editor/internal/sidebar/sections/tools/AltTextTool';
import { SLIDE_ALT_TEXT_MAX_CHARS } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

describe('alt-text limit', () => {
  it('matches the contract the server enforces', () => {
    expect(ALT_TEXT_MAX_CHARS).toBe(SLIDE_ALT_TEXT_MAX_CHARS);
  });
});
