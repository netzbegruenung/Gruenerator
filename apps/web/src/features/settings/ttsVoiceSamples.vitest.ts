/**
 * Every voice offered in the settings ships its sample sentence as a static
 * file — the "Hörprobe" button plays /voices/<id>.mp3 and nothing else. A voice
 * added to the registry without its clip would fail silently in the browser.
 *
 * Run: `npx vitest run src/features/settings/ttsVoiceSamples.vitest.ts`
 */
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

import { TTS_VOICES, ttsVoiceSampleUrl } from '@gruenerator/shared/settings';
import { describe, expect, it } from 'vitest';

const PUBLIC_DIR = path.resolve(__dirname, '../../../public');

describe('TTS voice samples', () => {
  it.each(TTS_VOICES.map((voice) => voice.id))('voice %s has a sample clip', (id) => {
    const file = path.join(PUBLIC_DIR, ttsVoiceSampleUrl(id));
    expect(existsSync(file), file).toBe(true);
    // A few seconds of 48 kbit/s speech; an empty or truncated encode is smaller.
    expect(statSync(file).size).toBeGreaterThan(10_000);
  });
});
