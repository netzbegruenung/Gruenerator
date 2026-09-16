import {
  SPEECH_MAX_CHUNK_CHARS,
  SPEECH_MAX_TEXT_CHARS,
  type SpeechOutputFormat,
  type SpeechPreset,
} from '@gruenerator/contracts';

export interface VoicePresetDef {
  title: string;
  description: string;
  /** One line above the editor: what a good text for this preset looks like. */
  hint: string;
  placeholder: string;
  defaultFormats: readonly SpeechOutputFormat[];
  maxChars: number;
}

/**
 * The three things people make with Grünerator Voice. A preset is UI defaults
 * only — the request carries the id so the server can pick a title, nothing
 * else differs on the wire.
 */
export const VOICE_PRESETS: Readonly<Record<SpeechPreset, VoicePresetDef>> = {
  mailbox: {
    title: 'Anrufbeantworter',
    description: 'Ansage für Büro, Ortsgruppe oder Abgeordnetenbüro',
    hint: 'Kurz und freundlich: wer spricht, wann ihr erreichbar seid und was Anrufende jetzt tun können.',
    placeholder:
      'Hallo, hier ist das Grüne Büro in Musterstadt. Wir sind gerade nicht erreichbar …',
    defaultFormats: ['wav_phone', 'mp3'],
    maxChars: 1500,
  },
  vorlesefassung: {
    title: 'Vorlesefassung',
    description: 'Einen Text als Hörfassung anbieten – barrierefrei und zum Mitnehmen',
    hint: 'Gesprochen wird, was dasteht: Abkürzungen ausschreiben, Links und Fußnoten weglassen.',
    placeholder: 'Text einfügen …',
    defaultFormats: ['mp3'],
    maxChars: SPEECH_MAX_TEXT_CHARS,
  },
  audiodeskription: {
    title: 'Audiodeskription',
    description: 'Beschreibt Sharepic, Plakat oder Video für Menschen, die es nicht sehen',
    hint: 'Beschreibe sachlich, was zu sehen ist – Bildaufbau, Text im Bild, Personen, Stimmung – in der Reihenfolge, in der das Auge es liest.',
    placeholder: 'Ein grünes Sharepic. Oben in weißer Schrift steht …',
    defaultFormats: ['mp3'],
    maxChars: SPEECH_MAX_CHUNK_CHARS,
  },
};

export const VOICE_PRESET_ORDER: readonly SpeechPreset[] = [
  'mailbox',
  'vorlesefassung',
  'audiodeskription',
];

export const FORMAT_LABELS: Readonly<Record<SpeechOutputFormat, { label: string; hint: string }>> =
  {
    mp3: { label: 'MP3', hint: 'Für Messenger, Website und Podcast' },
    wav_phone: { label: 'Telefon-WAV', hint: 'Für Fritz!Box, Asterisk und 3CX (8 kHz, mono)' },
  };

/** Three steps inside the provider's 0.8–1.2 range; the ends sound strained. */
export const SPEED_OPTIONS = [
  { value: 0.9, label: 'Langsam' },
  { value: 1, label: 'Normal' },
  { value: 1.1, label: 'Schnell' },
] as const;

/** Provider pause markup; snapped to 500 ms, chain two for a second. */
export const PAUSE_TAG = '<break time="500ms"/>';

/** What one pause tag is worth in finished audio. */
const PAUSE_SECONDS = 0.5;

/**
 * Characters of German prose per second at the default rate.
 *
 * A rule of thumb (~150 words per minute), not a measurement — which is why
 * every reading of it is prefixed with "≈". It exists so the button is not the
 * first place a person learns that their text is eleven minutes long.
 */
const CHARS_PER_SECOND = 13;

/** Rough length of the finished audio, in seconds. Pauses count, their tags do not. */
export function estimateSpeechSeconds(text: string, speed: number): number {
  const pauses = text.split(PAUSE_TAG).length - 1;
  const spoken = text.split(PAUSE_TAG).join('').trim().length;
  return spoken / CHARS_PER_SECOND / speed + pauses * PAUSE_SECONDS;
}
