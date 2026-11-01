import {
  SHAREPIC_ITEM_LABELS,
  type SharepicDraftFocus,
  type SharepicSpec,
} from '@gruenerator/contracts';

import { itemText } from './slideTexts.js';

/** The model sees the draft without the country — that is decided, not designed. */
/** The draft as the model sees it: country and brand are fixed and put back afterwards. */
export function withoutLocale(spec: SharepicSpec): Omit<SharepicSpec, 'locale' | 'brand'> {
  const { locale: _locale, brand: _brand, ...rest } = spec;
  return rest;
}

/** A revision rebuilt the whole deck live: background, highlight and blocks drifted on a text edit. */
export const KEEP_THE_REST =
  'Ändere nur, was verlangt ist. Alles andere – Texte, Farben, Hintergrund, Layout, Folienzahl – bleibt exakt wie in der aktuellen Fassung. „Schrift/Headline größer“ heißt: an der headline "groesse":"gross" setzen, ihre Zeilen bleiben, wie sie sind.';

/** Keeps a carousel revision on the slide the person is looking at. */
export function focusHint(current: SharepicSpec, focus: SharepicDraftFocus | null): string {
  if (!focus) return '';
  const lines: string[] = [];
  if (current.slides.length > 1) {
    lines.push(
      `Ändere nur Folie ${focus.slide + 1}, außer der Wunsch betrifft ausdrücklich das ganze Karussell – oder zeigt Folie ${focus.slide + 1} das schon: dann gilt er den Folien, die es noch nicht zeigen.`
    );
  }
  if (focus.elements?.length) {
    // Live, "Mach dieses Element kleiner" with the raw ids came back unchanged:
    // the model has to be told which item the selection is, in its own terms.
    const items = current.slides[focus.slide]?.items ?? [];
    const named = new Set<number>();
    const other: string[] = [];
    for (const id of focus.elements) {
      const m = /^(?:chart-)?sc-(\d+)-([a-z]+)(?:-|$)/.exec(id);
      const index = m ? Number(m[1]) : -1;
      if (m && items[index]?.type === m[2]) named.add(index);
      else other.push(id);
    }
    for (const index of [...named].sort((a, b) => a - b)) {
      const item = items[index]!;
      lines.push(
        `Gemeint ist: Folie ${focus.slide + 1}, Element ${index + 1} (${SHAREPIC_ITEM_LABELS[item.type]} „${itemText(item)}“, im Entwurf slides[${focus.slide}].items[${index}]). Darauf bezieht sich der Wunsch.`
      );
    }
    if (other.length) lines.push(`Außerdem ausgewählt: ${other.join(', ')}.`);
  }
  return lines.length ? `\n\n${lines.join('\n')}` : '';
}
