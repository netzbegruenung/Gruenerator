/**
 * The slide kinds a carousel's middle slides are built from: the content
 * Seiten of the Vorlagen catalogue. Drafted carousels repeated one build
 * (dachzeile + headline + absatz on 60 of 122 middle slides, 26.11.2026)
 * while the catalogue offers an image strip, a large number, question and
 * answer, a list, a chart. Only the build goes along, never the Seite's
 * colour: a carousel keeps one surface (`carouselLook.ts`), and a photo
 * ground in the middle would break it, so photo Seiten stay out.
 */
import {
  type SharepicBrand,
  type SharepicCreatorLocale,
  type SharepicItem,
} from '@gruenerator/contracts';

import { listSharepicSeiten } from '../sharepicVorlagen/catalog.js';

const itemName = (item: SharepicItem) =>
  item.type === 'bild' ? `bild (ausschnitt ${item.ausschnitt})` : item.type;

export function carouselSeitenText(
  locale: SharepicCreatorLocale,
  brand: SharepicBrand | null
): string {
  const seen = new Set<string>();
  const lines = listSharepicSeiten(locale, brand ?? 'gruene')
    .filter((s) => s.rolle === 'inhalt' && s.slide.background.kind === 'farbe')
    .flatMap((s) => {
      const build = s.slide.items.map(itemName).join(' + ');
      if (seen.has(build)) return [];
      seen.add(build);
      return [`- ${s.titel}: ${build}`];
    });
  if (lines.length === 0) return '';
  return `## Slide-Arten aus den Vorlagen

So bauen die Vorlagen die Slides zwischen Cover und Schluss. Wechsle die Art von Slide zu Slide – zwei gleich gebaute Slides hintereinander nur in einer Fotostrecke oder einem Textslider. Nimm von einer Art nur den Aufbau: die Fläche bleibt die des Karussells.

${lines.join('\n')}`;
}
