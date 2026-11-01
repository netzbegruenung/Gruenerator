import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

// EAS assigns the iOS provisioning profile before prebuild, to a target name it
// derives from `expo.name` with its own bundled @expo/config-plugins (55.x in
// every eas-cli up to 27.2.0: "Grnerator"). Prebuild then names the real target
// with ours. SDK 58 transliterates ("Grunerator"), so the profile went to a
// target that did not exist and the 1.7.0 build died in "Configure Xcode
// project". The pnpm patch on @expo/config-plugins keeps the old rule; this
// runs the installed code, so an upgrade that drops the patch fails here
// instead of on a paid EAS build. See the comment above `patchedDependencies`.
const requireHere = createRequire(import.meta.url);
const requireFromExpo = createRequire(requireHere.resolve('expo/package.json'));
const { IOSConfig } = requireFromExpo('@expo/config-plugins') as {
  IOSConfig: { XcodeUtils: { sanitizedName: (name: string) => string } };
};

const appJson = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, '../app.json'), 'utf8')
) as { expo: { name: string } };

describe('iOS target name', () => {
  it('matches the name eas-cli signs', () => {
    expect(IOSConfig.XcodeUtils.sanitizedName(appJson.expo.name)).toBe('Grnerator');
  });
});
