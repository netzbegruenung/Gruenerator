import { afterEach, describe, expect, it } from 'vitest';

// The stub by path, not via 'react-native': the alias in vitest.config.ts points
// at this very file, so it is the same module instance the code under test sees —
// but tsc resolves a bare 'react-native' to the real types, where a partial
// `constants` object does not typecheck.
import { Platform } from '../test/stubs/react-native';

import { DEV_AUTH_BYPASS, isEmulator } from './devAuth';

/**
 * The dev login bypass must never run anywhere but a throwaway emulator. Two
 * things guard that, and both are silent when they break — a bypass that wrongly
 * stays on shows no error, it just quietly renders somebody's phone as a fake
 * user. So both are pinned here.
 *
 * The fingerprints are the real ones, read off the two devices this was built
 * against (`adb shell getprop ro.build.fingerprint`), not invented.
 */
const EMULATOR = 'google/sdk_gphone64_arm64/emu64a:15/AE3A.240806.043/12960925:userdebug/dev-keys';
const GALAXY_S24 = 'samsung/e1sxeea/e1s:16/BP2A.250605.031.A3/S921BXXSECZD1:user/release-keys';

function standOn(fingerprint: string, model: string, brand: string, os = 'android'): void {
  Platform.OS = os as typeof Platform.OS;
  Platform.constants = { Fingerprint: fingerprint, Model: model, Brand: brand };
}

afterEach(() => {
  Platform.OS = 'android';
  Platform.constants = {};
});

describe('isEmulator', () => {
  it('recognises the Android emulator', () => {
    standOn(EMULATOR, 'sdk_gphone64_arm64', 'google');
    expect(isEmulator()).toBe(true);
  });

  it('does not mistake a real phone for one', () => {
    standOn(GALAXY_S24, 'SM-S921B', 'samsung');
    expect(isEmulator()).toBe(false);
  });

  it('needs an emulator product marker, not merely non-release keys', () => {
    // A rooted or custom-ROM phone can be signed with test-keys. It still is
    // somebody's phone, and it never calls itself sdk_gphone.
    standOn(GALAXY_S24.replace('release-keys', 'test-keys'), 'SM-S921B', 'samsung');
    expect(isEmulator()).toBe(false);
  });

  it('needs non-release keys, not merely a marker in the name', () => {
    // Belt to the braces above: a device whose name happens to contain a marker
    // but which ships a release-signed build is not a sandbox.
    standOn('acme/generic_x/gx:16/AB/1:user/release-keys', 'generic_x', 'acme');
    expect(isEmulator()).toBe(false);
  });

  it('treats anything it cannot identify as real hardware', () => {
    standOn('', '', '');
    expect(isEmulator()).toBe(false);
  });

  it('is false on iOS — RN exposes no simulator marker, so we do not guess', () => {
    standOn(EMULATOR, 'sdk_gphone64_arm64', 'google', 'ios');
    expect(isEmulator()).toBe(false);
  });
});

describe('DEV_AUTH_BYPASS', () => {
  it('is off in a release bundle whatever the env says', () => {
    // This lane defines `__DEV__: false` (vitest.config.ts) precisely to stand in
    // for a production bundle. The module is evaluated once at import, so this
    // asserts the shipped value — the gate that survives a stray .env on a build
    // machine.
    expect(DEV_AUTH_BYPASS).toBe(false);
  });
});
