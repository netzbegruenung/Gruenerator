import { type ReactNode } from 'react';

/**
 * TEST: small illustrations on the Bild & Video cards instead of the tool icon.
 * Switch off with `SHOW_TOOL_PREVIEWS = false` (cards fall back to the icon and
 * their pastel tile), or delete this file, `public/arbeiten-previews/` and the
 * two uses in ArbeitenSections.
 *
 * The pictures were generated with FLUX.2 [klein] (Melious, `flux-2-klein-9b`),
 * flat pastel style without text, 384 px JPEG.
 */
export const SHOW_TOOL_PREVIEWS = true;

const preview = (name: string): ReactNode => (
  <img
    src={`/arbeiten-previews/${name}.jpg`}
    alt=""
    loading="lazy"
    // The motif fills the middle of the square; zoom past the empty margin.
    className="size-full scale-125 object-cover"
  />
);

/** The picture on the front sheet of a card, keyed by tool id. */
export const TOOL_PREVIEWS: Partial<Record<string, ReactNode>> = {
  'canvas-vorlagen': preview('vorlagen'),
  profilbild: preview('profilbild'),
  'reels-untertitel': preview('video'),
  'studio-voice': preview('voice'),
  transkription: preview('transkription'),
  mediathek: preview('mediathek'),
};
