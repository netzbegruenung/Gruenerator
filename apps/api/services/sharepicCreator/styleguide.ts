/**
 * The creator's style guide, loaded chapter by chapter.
 *
 * Only the catalog (one line per chapter) sits in every prompt; a chapter's
 * body joins the prompt when the model asks for it. Bodies are Markdown under
 * `sharepic-creator/` in the private content checkout (`internContentRoot()`).
 * While that rollout lands, a file missing there is read from the public
 * `prompts/sharepic-creator/` instead — logged once, so the fallback shows up.
 */
import { readFileSync } from 'node:fs';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SHAREPIC_LIMITS, type SharepicCreatorLocale } from '@gruenerator/contracts';
import { z } from 'zod';

import { createLogger } from '../../utils/logger.js';
import { internContentRoot } from '../skills/internalPrompts.js';

const log = createLogger('sharepicStyleguide');

const PUBLIC_DIR = path.join(
  dirname(fileURLToPath(import.meta.url)),
  '../../prompts/sharepic-creator'
);

export const STYLEGUIDE_CHAPTERS = {
  fotos: 'Stockfotos suchen und wählen, Text aufs Foto oder Foto oben',
  texte: 'Headline-Zeilen, Akzent, Tonalität und Längen',
  veranstaltung: 'Termine: Datumskreis, Ort, Aufbau mit Foto oben',
  zitat: 'Zitatkarten mit und ohne Porträt',
  interview:
    'Interview oder Statement einer Person als Karussell: Cover-Zitat, Frage und Antwort je Slide',
  stoerer: 'Störer-Kreis: wann, wie kurz',
  karussell: 'Karussells: Bogen über mehrere Slides, Kritik, Erklärung, Geschichte',
  diagramme: 'Zahlen als Diagramm: wann statt großer Zahl, welche Art, Beschriftung',
  infografik:
    'Infografik: Punkte, Schritte, Mengen, Anteile oder eine große Zahl mit Bild (raster, ablauf, mengen, anteil, zahl)',
  faktenbild: 'Faktenbild: gemaltes Foto-Motiv (szene) als Hintergrund plus Zahl oder Diagramm',
  'liste-zahl':
    'Listen als Ziffern, Pfeile oder Häkchen (Bilanz), ein Punkt pro Slide mit großer Ziffer, eine große Zahl, Rechnung und Termine',
  belege:
    'Schlagzeile als Beleg, Zitat der Gegenseite mit „Fakt ist:“, Good News, Bullshit-Bingo und Starterpack',
  'iconliste-vergleich':
    'Punkte mit Themen-Icons, der Plan der anderen gegen unseren (Vergleich mit ✗/✓) und Mythos gegen Fakt (Faktencheck)',
} as const;

export type StyleguideChapter = keyof typeof STYLEGUIDE_CHAPTERS;
export const styleguideChapterSchema = z.enum(
  Object.keys(STYLEGUIDE_CHAPTERS) as [StyleguideChapter, ...StyleguideChapter[]]
);

const cache = new Map<string, string>();

function readRaw(file: string): string {
  try {
    return readFileSync(path.join(internContentRoot(), 'sharepic-creator', file), 'utf8');
  } catch {
    log.warn(`sharepic-creator/${file} not in the internal content — using the public copy.`);
    return readFileSync(path.join(PUBLIC_DIR, file), 'utf8');
  }
}

function read(file: string): string {
  let text = cache.get(file);
  if (text === undefined) {
    text = readRaw(file).trim();
    cache.set(file, text);
  }
  return text;
}

export function chapterText(chapter: StyleguideChapter): string {
  return read(`kapitel/${chapter}.md`);
}

/** The locale's basics are always in — every draft needs colours and fonts. */
export function basicsText(locale: SharepicCreatorLocale): string {
  return read(locale === 'de-AT' ? 'kapitel/grundlagen-at.md' : 'kapitel/grundlagen-de.md');
}

export function systemPrompt(locale: SharepicCreatorLocale): string {
  const catalog = Object.entries(STYLEGUIDE_CHAPTERS)
    .map(([id, summary]) => `- \`${id}\` — ${summary}`)
    .join('\n');
  return read('system.md')
    .replace(
      '{{partyName}}',
      locale === 'de-AT' ? 'Die Grünen in Österreich' : 'Bündnis 90/Die Grünen'
    )
    .replace('{{chapterCatalog}}', catalog)
    .replace('{{localeHint}}', locale === 'de-AT' ? ', österreichisches Deutsch' : '')
    .replace('{{headlineLine}}', String(SHAREPIC_LIMITS.headlineLine))
    .replace('{{headlineLines}}', String(SHAREPIC_LIMITS.headlineLines));
}

/** Occasions the example library is filed under. */
export const EXAMPLE_OCCASIONS = [
  'aufruf',
  'thema',
  'erklaerung',
  'zitat',
  'interview',
  'veranstaltung',
  'karussell-kritik',
  'karussell-erklaerung',
  'karussell-geschichte',
  'zahlen',
  'vergleich',
  'infografik',
] as const;
export type ExampleOccasion = (typeof EXAMPLE_OCCASIONS)[number];
export const exampleOccasionSchema = z.enum(EXAMPLE_OCCASIONS);

interface Example {
  id: string;
  land: SharepicCreatorLocale;
  anlass: ExampleOccasion;
  vorbild: string;
  spec: Record<string, unknown>;
}

let examples: Example[] | null = null;

export function loadExamples(): Example[] {
  examples ??= JSON.parse(readRaw('beispiele.json')) as Example[];
  return examples;
}

/**
 * Worked examples rebuilt from the party's own posts — orientation, not
 * templates. Same country first; the other country's only when there is none.
 */
export function examplesText(locale: SharepicCreatorLocale, occasions: ExampleOccasion[]): string {
  const all = loadExamples();
  const picked = occasions.flatMap((occasion) => {
    const own = all.filter((e) => e.anlass === occasion && e.land === locale);
    return own.length ? own : all.filter((e) => e.anlass === occasion).slice(0, 1);
  });
  if (picked.length === 0) return '';
  const body = picked
    .map((e) => `### ${e.anlass} – ${e.vorbild}\n${JSON.stringify(e.spec)}`)
    .join('\n\n');
  return `## Beispiele (Orientierung, nicht abschreiben – Texte und Foto passen zu DEINEM Auftrag)\n\n${body}`;
}
