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
    maxChars: 1500,
  },
  vorlesefassung: {
    title: 'Vorlesefassung',
    description: 'Einen Text als Hörfassung anbieten – barrierefrei und zum Mitnehmen',
    hint: 'Gesprochen wird, was dasteht: Abkürzungen ausschreiben, Links und Fußnoten weglassen.',
    placeholder: 'Text einfügen …',
    maxChars: SPEECH_MAX_TEXT_CHARS,
  },
  audiodeskription: {
    title: 'Audiodeskription',
    description: 'Beschreibt Sharepic, Plakat oder Video für Menschen, die es nicht sehen',
    hint: 'Beschreibe sachlich, was zu sehen ist – Bildaufbau, Text im Bild, Personen, Stimmung – in der Reihenfolge, in der das Auge es liest.',
    placeholder: 'Ein grünes Sharepic. Oben in weißer Schrift steht …',
    maxChars: SPEECH_MAX_CHUNK_CHARS,
  },
};

export const VOICE_PRESET_ORDER: readonly SpeechPreset[] = [
  'mailbox',
  'vorlesefassung',
  'audiodeskription',
];

/**
 * Every recording comes out in both formats. The server synthesises once and
 * only encodes twice, so asking for both costs no extra speech — and nobody has
 * to decide before hearing the result where the file will end up.
 */
export const ALL_FORMATS: readonly SpeechOutputFormat[] = ['mp3', 'wav_phone'];

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

/**
 * What a pause looks like while the text is being written.
 *
 * The field is a plain `<textarea>`, so a pause has to be characters — there is
 * no surface here that could hold the design's inline chip. Making those
 * characters readable is the reachable half of that idea: `<break time="500ms"/>`
 * is provider markup that nobody typed, nobody can interpret, and anybody will
 * eventually break by editing inside it — and a broken tag is read aloud,
 * angle brackets and all.
 *
 * Typing the token by hand works too. That is deliberate: what you see in the
 * field is the whole truth about where the pauses are.
 */
export const PAUSE_TOKEN = '[Pause]';

/** Editor text → what the API receives. The wire format does not change. */
export function toWire(text: string): string {
  return text.split(PAUSE_TOKEN).join(PAUSE_TAG);
}

/**
 * API text → what the editor shows.
 *
 * Only the exact tag we emit is folded back, so the round trip cannot lose
 * information. A tag with some other duration stays visible as markup rather
 * than being silently shortened to 500 ms — nothing produces one today.
 */
export function fromWire(text: string): string {
  return text.split(PAUSE_TAG).join(PAUSE_TOKEN);
}

/** How many pauses the text contains. */
export function countPauses(text: string): number {
  return text.split(PAUSE_TOKEN).length - 1;
}

/**
 * Length of the text as the API will see it.
 *
 * This is what every limit is measured against, because it is what gets sent.
 * It is larger than what the field shows, which is why the counter names the
 * number of pauses next to it instead of leaving the gap unexplained.
 */
export function wireLength(text: string): number {
  return text.length + countPauses(text) * (PAUSE_TAG.length - PAUSE_TOKEN.length);
}

/**
 * The longest prefix of `text` whose wire form still fits `maxChars`.
 *
 * Binary search rather than a trim loop: a full 24 576-character paste would
 * otherwise walk the string once per dropped character. `wireLength` never
 * shrinks as the prefix grows, so the predicate is monotonic.
 */
export function clampToWire(text: string, maxChars: number): string {
  if (wireLength(text) <= maxChars) return text;
  let fits = 0;
  let rest = text.length;
  while (fits < rest) {
    const mid = Math.ceil((fits + rest) / 2);
    if (wireLength(text.slice(0, mid)) <= maxChars) fits = mid;
    else rest = mid - 1;
  }
  return text.slice(0, fits);
}

/** What one pause is worth in finished audio. */
const PAUSE_SECONDS = 0.5;

/**
 * Characters of German prose per second at the default rate.
 *
 * A rule of thumb (~150 words per minute), not a measurement — which is why
 * every reading of it is prefixed with "≈". It exists so the button is not the
 * first place a person learns that their text is eleven minutes long.
 */
const CHARS_PER_SECOND = 13;

/** Rough length of the finished audio, in seconds. Pauses count, their tokens do not. */
export function estimateSpeechSeconds(text: string, speed: number): number {
  const spoken = text.split(PAUSE_TOKEN).join('').trim().length;
  return spoken / CHARS_PER_SECOND / speed + countPauses(text) * PAUSE_SECONDS;
}
