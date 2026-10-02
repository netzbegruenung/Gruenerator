/**
 * The creator's style guide, loaded chapter by chapter.
 *
 * Only the catalog (one line per chapter) sits in every prompt; a chapter's
 * body joins the prompt when the model asks for it. Bodies live as Markdown in
 * `prompts/sharepic-creator/` — public, because every rule in them is already
 * public in the canvas editor's brand code.
 */
import { readFileSync } from 'node:fs';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import type { SharepicCreatorLocale } from '@gruenerator/contracts';

const DIR = path.join(dirname(fileURLToPath(import.meta.url)), '../../prompts/sharepic-creator');

export const STYLEGUIDE_CHAPTERS = {
  fotos: 'Stockfotos suchen und wählen, Text aufs Foto oder Foto oben',
  texte: 'Headline-Zeilen, Akzent, Tonalität und Längen',
  veranstaltung: 'Termine: Datumskreis, Ort, Aufbau mit Foto oben',
  zitat: 'Zitatkarten mit und ohne Porträt',
  stoerer: 'Störer-Kreis: wann, wie kurz',
  karussell: 'Karussells: Bogen über mehrere Slides, Kritik, Erklärung, Geschichte',
} as const;

export type StyleguideChapter = keyof typeof STYLEGUIDE_CHAPTERS;
export const styleguideChapterSchema = z.enum(
  Object.keys(STYLEGUIDE_CHAPTERS) as [StyleguideChapter, ...StyleguideChapter[]]
);

const cache = new Map<string, string>();

function read(file: string): string {
  let text = cache.get(file);
  if (text === undefined) {
    text = readFileSync(path.join(DIR, file), 'utf8').trim();
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
    .replace('{{localeHint}}', locale === 'de-AT' ? ', österreichisches Deutsch' : '');
}

/** Occasions the example library is filed under. */
export const EXAMPLE_OCCASIONS = [
  'aufruf',
  'thema',
  'erklaerung',
  'zitat',
  'veranstaltung',
  'karussell-kritik',
  'karussell-erklaerung',
  'karussell-geschichte',
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
  examples ??= JSON.parse(readFileSync(path.join(DIR, 'beispiele.json'), 'utf8')) as Example[];
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
