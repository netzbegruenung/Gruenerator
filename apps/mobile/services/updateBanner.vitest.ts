import { describe, expect, it } from 'vitest';

import { chooseUpdateBanner, isNewerVersion, type UpdateBannerInput } from './updateBanner';

const none: UpdateBannerInput = {
  playDownloaded: false,
  otaPendingId: null,
  storeVersion: null,
  dismissed: new Set(),
};

describe('chooseUpdateBanner', () => {
  it('shows nothing when nothing is new', () => {
    expect(chooseUpdateBanner(none)).toBeNull();
  });

  it('offers the restart for a downloaded OTA update', () => {
    expect(chooseUpdateBanner({ ...none, otaPendingId: 'u1' })).toEqual({
      kind: 'restart',
      source: 'ota',
      key: 'ota:u1',
    });
  });

  it('offers the store for a newer binary', () => {
    expect(chooseUpdateBanner({ ...none, storeVersion: '1.7.0' })).toEqual({
      kind: 'store',
      key: 'store:1.7.0',
    });
  });

  it('puts a downloaded Play update before the OTA restart, and both before the store', () => {
    const all = { ...none, playDownloaded: true, otaPendingId: 'u1', storeVersion: '42' };
    expect(chooseUpdateBanner(all)?.key).toBe('play:downloaded');
    expect(chooseUpdateBanner({ ...all, playDownloaded: false })?.key).toBe('ota:u1');
  });

  it('falls through to the next offer once one is answered with „Später"', () => {
    const input = { ...none, otaPendingId: 'u1', storeVersion: '1.7.0' };
    expect(chooseUpdateBanner({ ...input, dismissed: new Set(['ota:u1']) })?.key).toBe(
      'store:1.7.0'
    );
    expect(
      chooseUpdateBanner({ ...input, dismissed: new Set(['ota:u1', 'store:1.7.0']) })
    ).toBeNull();
  });

  it('offers a later store version again after an earlier one was dismissed', () => {
    expect(
      chooseUpdateBanner({ ...none, storeVersion: '1.8.0', dismissed: new Set(['store:1.7.0']) })
        ?.key
    ).toBe('store:1.8.0');
  });
});

describe('isNewerVersion', () => {
  it.each([
    ['1.7.0', '1.6.0', true],
    ['1.10.0', '1.9.0', true],
    ['2.0', '1.99.99', true],
    ['1.6.0', '1.6.0', false],
    ['1.6', '1.6.0', false],
    ['1.5.9', '1.6.0', false],
  ])('%s newer than %s: %s', (candidate, installed, expected) => {
    expect(isNewerVersion(candidate, installed)).toBe(expected);
  });
});
