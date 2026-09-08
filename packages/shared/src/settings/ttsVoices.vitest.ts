import { ttsVoiceIdSchema } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { DEFAULT_TTS_VOICE_ID, TTS_VOICES, ttsVoiceLabel } from './ttsVoices';

describe('TTS voice registry', () => {
  it('numbers each reading group in list order', () => {
    expect(ttsVoiceLabel('1930')).toBe('Weiblich gelesen 1');
    expect(ttsVoiceLabel('1887')).toBe('Weiblich gelesen 2');
    expect(ttsVoiceLabel('1885')).toBe('Männlich gelesen 1');
    expect(ttsVoiceLabel('1708')).toBe('Männlich gelesen 2');
  });

  it('gives every voice a distinct label', () => {
    const labels = TTS_VOICES.map((voice) => ttsVoiceLabel(voice.id));
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('covers exactly the ids the contract accepts', () => {
    expect(TTS_VOICES.map((voice) => voice.id).sort()).toEqual(
      [...ttsVoiceIdSchema.options].sort()
    );
    expect(ttsVoiceIdSchema.options).toContain(DEFAULT_TTS_VOICE_ID);
  });
});
