import {
  isSharepicSceneRef,
  isSharepicUploadId,
  type SharepicPhotoAttribution,
  type SharepicSpec,
} from '@gruenerator/contracts';

/** Where one slide's picture comes from. */
type PictureSource =
  | { kind: 'farbe' }
  | { kind: 'unsplash'; photographer: string | null }
  | { kind: 'eigenes-foto' }
  | { kind: 'ki-bild' };

const sourceOf = (
  slide: SharepicSpec['slides'][number],
  attribution: SharepicPhotoAttribution | null
): PictureSource => {
  // No default: a new background kind must be mapped here (compile error otherwise).
  const bg = slide.background;
  switch (bg.kind) {
    case 'farbe':
      return { kind: 'farbe' };
    case 'foto':
    case 'foto-oben':
    case 'foto-unten':
      // The user's own photos stand under an `upload:N` id instead of a stock file name.
      if (isSharepicUploadId(bg.filename)) return { kind: 'eigenes-foto' };
      if (isSharepicSceneRef(bg.filename)) return { kind: 'ki-bild' };
      return { kind: 'unsplash', photographer: attribution?.photographer ?? null };
    default: {
      const unmapped: never = bg;
      return unmapped;
    }
  }
};

const describe = (source: PictureSource): string => {
  switch (source.kind) {
    case 'farbe':
      return 'Farbfläche';
    case 'ki-bild':
      return 'KI-generiertes Bild';
    case 'eigenes-foto':
      return 'Eigenes Foto';
    case 'unsplash':
      return source.photographer
        ? `Stockfoto von ${source.photographer} auf Unsplash`
        : 'Stockfoto von Unsplash';
  }
};

/** One sharepic carries the label, a carousel's slides each carry it. */
const labelNote = (slides: number) =>
  `Text und Layout hat die KI entworfen; ${slides > 1 ? 'die Folien tragen' : 'das Sharepic trägt'} das Label „KI-Generiert“ (im Editor entfernbar).`;

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
