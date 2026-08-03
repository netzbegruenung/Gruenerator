import { describe, expect, it } from 'vitest';

import { deriveContentOrigin } from './sharedMediaOrigin.js';

/**
 * The fallback for clients that predate `contentOrigin`. It has to reproduce what
 * the galleries used to decide on the read side — otherwise the rollout would
 * silently reclassify existing users' images the moment the API deploys, before
 * a single client has updated.
 */

describe('deriveContentOrigin', () => {
  it('trusts the KI-only metadata shapes over the type string', () => {
    // Both are written exclusively by KI flows, and they are the only signals
    // that survive when image_type was never set.
    expect(deriveContentOrigin(null, { kiConfig: { kiType: 'pure-create' } })).toBe('ki');
    expect(deriveContentOrigin(null, { source: 'bild-editor' })).toBe('ki');
    expect(deriveContentOrigin('Dreizeilen', { source: 'bild-editor' })).toBe('ki');
  });

  it('ignores a kiConfig that is explicitly absent', () => {
    expect(deriveContentOrigin('Zitat', { kiConfig: null })).toBe('sharepic');
    expect(deriveContentOrigin('Zitat', { kiConfig: undefined })).toBe('sharepic');
  });

  it('falls through to the legacy type when no metadata decides it', () => {
    expect(deriveContentOrigin('pure-create', {})).toBe('ki');
    expect(deriveContentOrigin('Dreizeilen', {})).toBe('sharepic');
    expect(deriveContentOrigin('imagine', null)).toBe('ki');
  });

  it('returns unknown for the case that caused the bug', () => {
    // `typeConfig?.legacyType || type || ''` sent '' whenever the studio type was
    // not set yet, and the column stored NULL. Neither bucket may claim it.
    expect(deriveContentOrigin('', {})).toBe('unknown');
    expect(deriveContentOrigin(null, {})).toBe('unknown');
    expect(deriveContentOrigin(undefined, undefined)).toBe('unknown');
  });

  it('does not treat sharepicType as a signal', () => {
    // Both flows write it, so using it would classify half the KI images as
    // sharepics — exactly the failure being fixed.
    expect(deriveContentOrigin(null, { sharepicType: 'zitat' })).toBe('unknown');
  });
});
