import { type ReactNode } from 'react';

/**
 * Small pictures on the „Mach mehr mit deinem Grünerator" cards, shown instead of the tool icon.
 *
 * All from Unsplash (Unsplash licence: free use, no attribution required), cut to the sheet:
 * - video.jpg       — film reels, Noom Peerapong (unsplash.com/photos/2uwFEAGUm6E)
 * - notebooks.jpg   — reading woman, Art Institute of Chicago (A_JEIQvJ0Iw)
 * - vorlagen.jpg    — botanical sunflower, Europeana (kKu1pSsNk54)
 * - profilbild.jpg  — portrait in profile, Birmingham Museums Trust (laGUzKTY7mA)
 * - voice.jpg       — sound wave, Susan Wilkinson (fMXyMuOxuYU)
 * - uebersetzer.jpg — abstract painting, Fons Heijnsbroek (S1Cv0sXA7uI)
 */

// `zoom` skips past an empty margin around the motif; a picture that fills its frame
// (a whole painting) goes without it.
const preview = (name: string, { zoom = true }: { zoom?: boolean } = {}): ReactNode => (
  <img
    src={`/arbeiten-previews/${name}.jpg`}
    alt=""
    loading="lazy"
    // Dimmed in dark mode so the light picture doesn't glare on the card.
    className={`size-full object-cover dark:brightness-[.8] ${zoom ? 'scale-125' : ''}`}
  />
);

/** The picture on the front sheet of a card, keyed by tool id. */
export const TOOL_PREVIEWS: Partial<Record<string, ReactNode>> = {
  canvas: preview('video'),
  projekte: preview('notebooks', { zoom: false }),
  'canvas-vorlagen': preview('vorlagen', { zoom: false }),
  profilbild: preview('profilbild'),
  voice: preview('voice', { zoom: false }),
  uebersetzer: preview('uebersetzer'),
};
