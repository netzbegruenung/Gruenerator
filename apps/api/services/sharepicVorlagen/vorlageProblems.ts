import { type SharepicVorlageFileEntry } from '@gruenerator/contracts';

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
  for (const { background } of entry.spec.slides) {
    if (background.kind !== 'farbe' && !hasStockPhoto(background.filename)) {
      problems.push(`unknown stock photo ${background.filename}`);
    }
  }
  if (entry.spec.locale === 'de-AT' && JSON.stringify(entry.spec).includes('++')) {
    problems.push('++marker++ in an AT spec');
  }
  return problems;
}
