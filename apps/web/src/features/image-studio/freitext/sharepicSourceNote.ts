import { type SharepicPhotoAttribution, type SharepicSpec } from '@gruenerator/contracts';

/** Where one slide's picture comes from. A future AI background is one more branch here. */
type PictureSource =
  { kind: 'farbe' } | { kind: 'unsplash'; photographer: string | null } | { kind: 'ki-bild' };

const sourceOf = (
  slide: SharepicSpec['slides'][number],
  attribution: SharepicPhotoAttribution | null
): PictureSource =>
  slide.background.kind === 'farbe'
    ? { kind: 'farbe' }
    : { kind: 'unsplash', photographer: attribution?.photographer ?? null };

const describe = (source: PictureSource): string => {
  switch (source.kind) {
    case 'farbe':
      return 'Farbfläche';
    case 'ki-bild':
      return 'KI-generiertes Bild';
    case 'unsplash':
      return source.photographer
        ? `Stockfoto von ${source.photographer} auf Unsplash`
        : 'Stockfoto von Unsplash';
  }
};

const LABEL_NOTE =
  'Text und Layout hat die KI entworfen; die Slides tragen das Label „KI-Generiert“ (im Editor entfernbar).';

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
  } else if (new Set(labels).size === 1) {
    const hint = sources[0]!.kind === 'ki-bild' ? '' : ' – kein KI-Bild';
    pictures = `Bilder: ${labels[0]}${hint}.`;
  } else {
    pictures = `Bilder: ${labels.map((label, i) => `Slide ${i + 1} ${label}`).join(', ')}.`;
  }
  return `${pictures} ${LABEL_NOTE}`;
}
