import { describe, expect, it } from 'vitest';

import {
  CHAT_BACKGROUND_PRESETS,
  DEFAULT_CHAT_BACKGROUND,
  DEFAULT_CHAT_BACKGROUND_MOBILE,
  chatBackgroundsFor,
  resolveChatBackground,
} from './chatBackgrounds';

/**
 * The interesting part of this module is not the list — it is that a preset can
 * exist on one platform before the other, and that the two questions that
 * follow from it ("what does an unset profile get?" and "what does a stored
 * preset this platform cannot draw turn into?") have answers that do not
 * silently fall through.
 */
describe('resolveChatBackground', () => {
  it('gives an unset profile the platform default', () => {
    expect(resolveChatBackground(null, 'mobile').key).toBe(DEFAULT_CHAT_BACKGROUND_MOBILE);
    expect(resolveChatBackground(null, 'web').key).toBe(DEFAULT_CHAT_BACKGROUND);
    expect(resolveChatBackground(null).key).toBe(DEFAULT_CHAT_BACKGROUND);
  });

  it('keeps a stored preset the platform can draw', () => {
    expect(resolveChatBackground('tanne', 'mobile').key).toBe('tanne');
    expect(resolveChatBackground('tanne', 'web').key).toBe('tanne');
    // Chosen in the app, opened in the browser — since web draws them too.
    for (const key of ['nebel', 'dunst']) {
      expect(resolveChatBackground(key, 'mobile').key).toBe(key);
      expect(resolveChatBackground(key, 'web').key).toBe(key);
    }
  });

  it('substitutes a preset the platform does not draw', () => {
    // Showing one would mean rendering another preset's look under its name, so
    // each resolves to the platform's own default instead.
    expect(resolveChatBackground('mesh', 'web').key).toBe(DEFAULT_CHAT_BACKGROUND);
    expect(resolveChatBackground('kern', 'mobile').key).toBe(DEFAULT_CHAT_BACKGROUND_MOBILE);
  });

  it('falls back for values outside the schema', () => {
    for (const value of ['gibtsnicht', 42, undefined, {}]) {
      expect(resolveChatBackground(value, 'mobile').key).toBe(DEFAULT_CHAT_BACKGROUND_MOBILE);
    }
  });
});

describe('chatBackgroundsFor', () => {
  it('offers a one-platform preset only to that platform', () => {
    expect(chatBackgroundsFor('mobile').map((p) => p.key)).toContain('mesh');
    expect(chatBackgroundsFor('web').map((p) => p.key)).not.toContain('mesh');
    expect(chatBackgroundsFor('web').map((p) => p.key)).toContain('kern');
    expect(chatBackgroundsFor('mobile').map((p) => p.key)).not.toContain('kern');
  });

  it('offers every unmarked preset to both', () => {
    const unmarked = CHAT_BACKGROUND_PRESETS.filter((p) => !p.platforms).map((p) => p.key);
    for (const platform of ['web', 'mobile'] as const) {
      expect(chatBackgroundsFor(platform).map((p) => p.key)).toEqual(
        expect.arrayContaining(unmarked)
      );
    }
  });

  it('keeps each platform default among the presets that platform offers', () => {
    expect(chatBackgroundsFor('web').map((p) => p.key)).toContain(DEFAULT_CHAT_BACKGROUND);
    expect(chatBackgroundsFor('mobile').map((p) => p.key)).toContain(
      DEFAULT_CHAT_BACKGROUND_MOBILE
    );
  });
});
