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
    expect(resolveChatBackground('nebel', 'mobile').key).toBe('nebel');
    expect(resolveChatBackground('dunst', 'mobile').key).toBe('dunst');
  });

  it('substitutes a preset the platform does not draw', () => {
    // Chosen in the app, opened in the browser: web has no class for the mesh
    // presets, so showing one would mean rendering another preset's look under
    // its name. They resolve to web's own default instead.
    for (const key of ['mesh', 'nebel', 'dunst']) {
      expect(resolveChatBackground(key, 'web').key).toBe(DEFAULT_CHAT_BACKGROUND);
    }
  });

  it('falls back for values outside the schema', () => {
    for (const value of ['gibtsnicht', 42, undefined, {}]) {
      expect(resolveChatBackground(value, 'mobile').key).toBe(DEFAULT_CHAT_BACKGROUND_MOBILE);
    }
  });
});

describe('chatBackgroundsFor', () => {
  it('offers the app-only presets to the app and not to the browser', () => {
    for (const key of ['mesh', 'nebel', 'dunst']) {
      expect(chatBackgroundsFor('mobile').map((p) => p.key)).toContain(key);
      expect(chatBackgroundsFor('web').map((p) => p.key)).not.toContain(key);
    }
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
