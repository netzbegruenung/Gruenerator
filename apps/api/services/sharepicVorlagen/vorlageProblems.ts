import {
  type SharepicCreatorLocale,
  type SharepicSeiteFileEntry,
  type SharepicSlide,
  type SharepicVorlage,
  type SharepicVorlageFileEntry,
} from '@gruenerator/contracts';

import { hasStockPhoto } from '../sharepicCreator/catalog.js';
import { namedSharepicForm } from '../sharepicCreator/forms.js';

/**
 * What the schema cannot see about a catalogue entry. The loader serves an
 * entry anyway — these are editorial checks for `pnpm vorlagen:check`:
 *
 * - every chat prompt must make the creator pick the entry's form (or, for an
 *   Einzelbild, leave the choice to it), or the hint promises the wrong thing;
 * - photos must be stock photos we host;
 * - `++marker++` is DE-only; AT marks with `==…==`.
 */
export function vorlageProblems(entry: SharepicVorlageFileEntry): string[] {
  const problems: string[] = [];
  for (const prompt of entry.chat.prompts) {
    const form = namedSharepicForm(prompt);
    if (form !== entry.form && !(form === null && entry.form === 'einzelbild')) {
      problems.push(`prompt names ${form ?? 'no form'}, not ${entry.form}: „${prompt}“`);
    }
  }
  problems.push(...photoProblems(entry.spec.slides));
  if (entry.spec.locale === 'de-AT' && JSON.stringify(entry.spec).includes('++')) {
    problems.push('++marker++ in an AT spec');
  }
  return problems;
}

/** The same checks for a single Seite, plus: its `quelle` must still exist. */
export function seiteProblems(
  entry: SharepicSeiteFileEntry,
  locale: SharepicCreatorLocale,
  vorlagen: readonly Pick<SharepicVorlage, 'id' | 'spec'>[]
): string[] {
  const problems = photoProblems([entry.slide]);
  if (locale === 'de-AT' && JSON.stringify(entry.slide).includes('++')) {
    problems.push('++marker++ in an AT slide');
  }
  if (entry.quelle) {
    const { vorlage, seite } = entry.quelle;
    const source = vorlagen.find((v) => v.id === vorlage);
    if (!source || seite > source.spec.slides.length) {
      problems.push(`quelle ${vorlage}#${seite} is not in the Vorlagen catalogue`);
    }
  }
  return problems;
}

function photoProblems(slides: readonly SharepicSlide[]): string[] {
  return slides.flatMap(({ background }) =>
    background.kind !== 'farbe' && !hasStockPhoto(background.filename)
      ? [`unknown stock photo ${background.filename}`]
      : []
  );
}
