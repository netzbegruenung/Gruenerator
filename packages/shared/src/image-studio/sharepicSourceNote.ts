import {
  isSharepicSceneRef,
  isSharepicUploadId,
  isSharepicVorlageRef,
  slidePhotoFilename,
  type SharepicPhotoAttribution,
  type SharepicSpec,
} from '@gruenerator/contracts';

/** Where one slide's picture comes from. */
type PictureSource =
  | { kind: 'farbe' }
  | { kind: 'unsplash'; photographer: string | null }
  | { kind: 'eigenes-foto' }
  | { kind: 'ki-bild' }
  | { kind: 'vorlage-foto' };

const sourceOf = (
  slide: SharepicSpec['slides'][number],
  attribution: SharepicPhotoAttribution | null
): PictureSource => {
  // The background's photo, or a `bild` placed on a colour (own cut-out, stock photo).
  const filename = slidePhotoFilename(slide);
  if (!filename) return { kind: 'farbe' };
  // The user's own photos stand under an `upload:N` id instead of a stock file name.
  if (isSharepicUploadId(filename)) return { kind: 'eigenes-foto' };
  if (isSharepicSceneRef(filename)) return { kind: 'ki-bild' };
  if (isSharepicVorlageRef(filename)) return { kind: 'vorlage-foto' };
  return { kind: 'unsplash', photographer: attribution?.photographer ?? null };
};

const describe = (source: PictureSource): string => {
  switch (source.kind) {
    case 'farbe':
      return 'Farbfläche';
    case 'ki-bild':
      return 'KI-generiertes Bild';
    case 'eigenes-foto':
      return 'Eigenes Foto';
    case 'vorlage-foto':
      return 'Foto aus der Grünerator-Vorlage';
    case 'unsplash':
      return source.photographer
        ? `Stockfoto von ${source.photographer} auf Unsplash`
        : 'Stockfoto von Unsplash';
  }
};

/** One sharepic carries the short label; a carousel closes with the long one (see `composeSharepic`). */
const labelNote = (slides: number) =>
  `Text und Layout hat die KI entworfen; ${slides > 1 ? 'die Folien tragen das Label „KI-Generiert“, die letzte „Klimaschonend KI-generiert mit dem Grünerator“' : 'das Sharepic trägt das Label „KI-Generiert“'} (im Editor entfernbar).`;

/** Tells the user where the pictures come from and that the slides carry the AI label. */
export function sharepicSourceNote(
  slides: SharepicSpec['slides'],
  attributions: (SharepicPhotoAttribution | null)[]
): string {
  const sources = slides.map((slide, i) => sourceOf(slide, attributions[i] ?? null));
  const labels = sources.map(describe);
  let pictures: string;
  if (sources.every((s) => s.kind === 'farbe')) {
    pictures = 'Kein Foto, nur Farbflächen.';
  } else {
    const hint = sources.some((s) => s.kind === 'ki-bild') ? '' : ' – kein KI-Bild';
    const list =
      new Set(labels).size === 1
        ? labels[0]
        : labels.map((label, i) => `Folie ${i + 1} ${label}`).join(', ');
    pictures = `Bilder: ${list}${hint}.`;
  }
  const illustrated = slides.some((slide) =>
    slide.items.some((item) => item.type === 'infografik' && item.punkte.some((p) => p.bild))
  );
  const illustrations = illustrated ? ' Die Illustrationen sind KI-generiert.' : '';
  return `${pictures}${illustrations} ${labelNote(slides.length)}`;
}
