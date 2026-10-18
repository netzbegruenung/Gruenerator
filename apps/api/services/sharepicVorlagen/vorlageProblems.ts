import {
  isSharepicSceneRef,
  isSharepicUploadId,
  SHAREPIC_VORLAGE_REF,
  type PrintSpec,
  type SharepicCreatorLocale,
  type SharepicSeiteFileEntry,
  type SharepicSlide,
  type SharepicVorlage,
  type SharepicVorlageFileEntry,
} from '@gruenerator/contracts';

import { hasStockPhoto } from '../sharepicCreator/catalog.js';
import { namedSharepicForm } from '../sharepicCreator/forms.js';

import { sharepicVorlageAssetFile } from './catalog.js';

/**
 * What the schema cannot see about a catalogue entry. The loader serves an
 * entry anyway — these are editorial checks for `pnpm vorlagen:check`:
 *
 * - every chat prompt must make the creator pick the entry's form (or, for an
 *   Einzelbild, leave the choice to it), or the hint promises the wrong thing;
 * - photos must be stock photos we host or files in `assets/` (`vorlage:`),
 *   never one user's (`upload:`, `ki:`); a cut-out ships its cut-out (a steckbrief
 *   may show its person uncut);
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

/** A print Vorlage's photos: each a stock photo we host or a file in `assets/`. */
export function printProblems(spec: PrintSpec): string[] {
  return printFotos(spec)
    .filter((foto): foto is string => foto !== undefined)
    .map(photoProblem)
    .filter((p): p is string => p !== null);
}

function printFotos(spec: PrintSpec): (string | undefined)[] {
  switch (spec.variante) {
    case 'visitenkarte':
    case 'typo':
    case 'briefbogen':
      return [];
    case 'veranstaltung':
      return [spec.slots.foto, ...(spec.slots.mitwirkende ?? []).map((m) => m.foto)];
    case 'flyer-falz':
      return spec.slots.fotos;
    case 'flyer-a6':
      return [spec.slots.foto, spec.slots.rueckseite.foto];
    case 'gemeindezeitung':
      return [spec.slots.foto, ...spec.slots.artikel.map((a) => a.foto)];
    default:
      return [spec.slots.foto];
  }
}

function photoProblem(filename: string): string | null {
  if (isSharepicUploadId(filename) || isSharepicSceneRef(filename)) {
    return `${filename} belongs to one user, not to the catalogue`;
  }
  const asset = SHAREPIC_VORLAGE_REF.exec(filename)?.[1];
  if (asset) return sharepicVorlageAssetFile(asset) ? null : `missing asset ${asset}`;
  return hasStockPhoto(filename) ? null : `unknown stock photo ${filename}`;
}

function photoProblems(slides: readonly SharepicSlide[]): string[] {
  return slides.flatMap(({ background, items }) => {
    const bilder = items.flatMap((i) => (i.type === 'bild' ? [i] : []));
    // A steckbrief may show its person uncut, with the photo's own background.
    const uncutAllowed = items.some((i) => i.type === 'steckbrief');
    return [
      ...(background.kind !== 'farbe' ? [background.filename] : []),
      ...bilder.flatMap((b) => [b.quelle, ...(b.freisteller ? [b.freisteller] : [])]),
    ]
      .map(photoProblem)
      .concat(
        bilder.map((b) =>
          b.ausschnitt === 'freigestellt' && !b.freisteller && !uncutAllowed
            ? `bild ${b.quelle} is freigestellt but ships no freisteller: the copy shows it uncut`
            : null
        )
      )
      .filter((p): p is string => p !== null);
  });
}
