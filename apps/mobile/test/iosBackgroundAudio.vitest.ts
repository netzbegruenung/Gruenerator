import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

// Reading aloud past the lock screen (`useNativeTTS`) needs `audio` in the iOS
// UIBackgroundModes; without it iOS suspends the app as soon as it leaves the
// foreground, and `shouldPlayInBackground` changes nothing. expo-audio's plugin
// adds the mode, but expo-video's plugin with `supportsBackgroundPlayback: false`
// filters it back out — and app.json still reads as if everything were fine.
// So this resolves the config the way prebuild does, with every plugin applied.
const requireHere = createRequire(import.meta.url);
const expoCli = path.join(path.dirname(requireHere.resolve('expo/package.json')), 'bin/cli');
const projectRoot = path.resolve(import.meta.dirname, '..');

describe('iOS background audio', () => {
  it('keeps audio in UIBackgroundModes after all config plugins ran', () => {
    const out = execFileSync(
      process.execPath,
      [expoCli, 'config', '--type', 'introspect', '--json'],
      {
        cwd: projectRoot,
        env: { ...process.env, EXPO_NO_TELEMETRY: '1' },
        encoding: 'utf8',
      }
    );
    const config = JSON.parse(out) as { ios?: { infoPlist?: { UIBackgroundModes?: string[] } } };

    expect(config.ios?.infoPlist?.UIBackgroundModes).toContain('audio');
  }, 60_000);
});
