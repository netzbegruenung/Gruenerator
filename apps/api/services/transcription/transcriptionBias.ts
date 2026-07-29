/**
 * Locale-specific vocabulary handed to the transcription model.
 *
 * Same shape as the `LÄNDERKONTEXT` fork in the chat system prompts: a pure
 * (locale) => value function, so a new locale is one entry rather than a new
 * branch in every request builder.
 *
 * Only Voxtral consumes this — Mistral's `context_bias` takes up to 100 words
 * or phrases to steer spelling of proper nouns and domain vocabulary. Regolo's
 * faster-whisper endpoint has no equivalent parameter (measured 2026-07-29:
 * it accepts only file/model/language), so short clips routed there fall back
 * to the model's own German, which handled Austrian terms well in testing.
 *
 * Mistral documents context biasing as "optimized for English; support for
 * other languages is experimental" — treat this as a nudge, not a guarantee.
 */

import { type Locale } from '../localization/types.js';

/** Mistral's documented ceiling for context_bias. */
export const MAX_CONTEXT_BIAS_TERMS = 100;

const AT_TERMS: readonly string[] = [
  // Kalender & Alltag
  'Jänner',
  'Feber',
  'heuer',
  'Sackerl',
  'Trafik',
  'Jause',
  'Matura',
  'Greißler',
  // Institutionen & Ämter
  'Nationalrat',
  'Bundesrat',
  'Landtag',
  'Landeshauptmann',
  'Landeshauptfrau',
  'Klubobmann',
  'Klubobfrau',
  'Magistrat',
  'Bezirkshauptmannschaft',
  'Volksanwaltschaft',
  // Parteien
  'ÖVP',
  'SPÖ',
  'FPÖ',
  'NEOS',
  'KPÖ',
  'Die Grünen – Die Grüne Alternative',
  // Bundesländer
  'Burgenland',
  'Kärnten',
  'Niederösterreich',
  'Oberösterreich',
  'Salzburg',
  'Steiermark',
  'Tirol',
  'Vorarlberg',
  'Wien',
  // Landeshauptstädte
  'Eisenstadt',
  'Klagenfurt',
  'St. Pölten',
  'Linz',
  'Graz',
  'Innsbruck',
  'Bregenz',
  // Organisationen & Politikfelder
  'AMS',
  'ÖBB',
  'ORF',
  'Wiener Linien',
  'Klimaticket',
  'Sozialhilfe',
  'Pflegegeld',
  'Mindestsicherung',
  // Grüne Politiker:innen
  'Leonore Gewessler',
  'Werner Kogler',
  'Sigrid Maurer',
  'Alma Zadić',
  'Olga Voglauer',
  'Nina Tomaselli',
  'Lukas Hammer',
  'Barbara Neßler',
  'David Stögmüller',
  'Georg Bürstmayr',
];

const DE_TERMS: readonly string[] = [
  // Institutionen & Ämter
  'Bundestag',
  'Bundesrat',
  'Landtag',
  'Ministerpräsident',
  'Ministerpräsidentin',
  'Fraktionsvorsitzende',
  'Bundeskanzler',
  'Landkreis',
  // Parteien
  'CDU',
  'CSU',
  'SPD',
  'FDP',
  'AfD',
  'Die Linke',
  'BSW',
  'Bündnis 90/Die Grünen',
  // Organisationen & Politikfelder
  'Deutsche Bahn',
  'Bürgergeld',
  'Deutschlandticket',
  'Kindergrundsicherung',
  'Gebäudeenergiegesetz',
  // Grüne Politiker:innen
  'Robert Habeck',
  'Annalena Baerbock',
  'Ricarda Lang',
  'Omid Nouripour',
  'Katharina Dröge',
  'Britta Haßelmann',
  'Cem Özdemir',
  'Steffi Lemke',
  'Anton Hofreiter',
  'Franziska Brantner',
];

/**
 * Vocabulary hints for the given locale, capped at the provider's limit.
 * Never empty — both locales carry party and institution names whose spelling
 * the model otherwise guesses.
 */
export function buildContextBias(locale: Locale): string[] {
  const terms = locale === 'de-AT' ? AT_TERMS : DE_TERMS;
  return terms.slice(0, MAX_CONTEXT_BIAS_TERMS);
}
