import { DEFAULT_TTS_VOICE_ID, type TtsVoiceId } from '@gruenerator/contracts';

export type TtsVoiceReading = 'female' | 'male';
export type TtsVoiceAge = 'young' | 'middle' | 'older';

export interface TtsVoice {
  id: TtsVoiceId;
  /** How the voice reads to a listener; the label counts within this group. */
  reading: TtsVoiceReading;
  age: TtsVoiceAge;
}

/**
 * The voices offered in the settings, in numbering order. Every entry is one of
 * KugelAudio's high-quality German voices; the provider's marketing names stay
 * out of the product, a person picks "Weiblich gelesen 3" by listening to it.
 * Samples live under apps/web/public/voices/<id>.mp3 — one sentence, rendered
 * once through our own synthesis path.
 *
 * Append only: the label is derived from the position within its reading group.
 */
export const TTS_VOICES: readonly TtsVoice[] = [
  { id: '1930', reading: 'female', age: 'middle' },
  { id: '1887', reading: 'female', age: 'middle' },
  { id: '1885', reading: 'male', age: 'middle' },
  { id: '1876', reading: 'female', age: 'middle' },
  { id: '1840', reading: 'female', age: 'middle' },
  { id: '1708', reading: 'male', age: 'older' },
  { id: '1707', reading: 'female', age: 'young' },
  { id: '1705', reading: 'female', age: 'young' },
  { id: '1704', reading: 'female', age: 'middle' },
  { id: '1660', reading: 'male', age: 'young' },
  { id: '1659', reading: 'female', age: 'young' },
  { id: '1657', reading: 'male', age: 'middle' },
  { id: '980', reading: 'male', age: 'middle' },
  { id: '979', reading: 'female', age: 'middle' },
  { id: '978', reading: 'female', age: 'young' },
  { id: '973', reading: 'female', age: 'middle' },
  { id: '972', reading: 'male', age: 'middle' },
];

const READING_LABEL: Record<TtsVoiceReading, string> = {
  female: 'Weiblich gelesen',
  male: 'Männlich gelesen',
};

export const TTS_VOICE_AGE_LABEL: Record<TtsVoiceAge, string> = {
  young: 'jung',
  middle: 'mittleres Alter',
  older: 'älter',
};

/** "Weiblich gelesen 3" — numbered within the reading group, in list order. */
export function ttsVoiceLabel(id: TtsVoiceId): string {
  const voice = TTS_VOICES.find((v) => v.id === id);
  if (!voice) return id;
  const index = TTS_VOICES.filter((v) => v.reading === voice.reading).indexOf(voice);
  return `${READING_LABEL[voice.reading]} ${index + 1}`;
}

export function ttsVoiceSampleUrl(id: TtsVoiceId): string {
  return `/voices/${id}.mp3`;
}

export { DEFAULT_TTS_VOICE_ID };
