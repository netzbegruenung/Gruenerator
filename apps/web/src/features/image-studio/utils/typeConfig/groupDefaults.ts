import type { CanvasFormatGroup } from '@gruenerator/canvas-editor/formats';

interface GroupDefaultPreview {
  webp: string;
  png: string;
}

/**
 * Default preview asset per non-sharepic format group, used when a template
 * appears in the FormatBrowser under a section it wasn't authored for.
 *
 * `null` for `sharepic` because sharepic templates always carry their own
 * authored `previewImage` — no group default needed.
 *
 * Until the designed assets are dropped in, the FormatBrowser falls back to
 * the existing `GROUP_BACKGROUND` solid-color block.
 */
export const GROUP_DEFAULT_PREVIEW: Record<CanvasFormatGroup, GroupDefaultPreview | null> = {
  sharepic: null,
  story: {
    webp: '/imagine/previews/default-story-preview.webp',
    png: '/imagine/previews/default-story-preview.png',
  },
  praesentation: {
    webp: '/imagine/previews/default-presentation-preview.webp',
    png: '/imagine/previews/default-presentation-preview.png',
  },
  flyer: {
    webp: '/imagine/previews/default-flyer-preview.webp',
    png: '/imagine/previews/default-flyer-preview.png',
  },
  plakat: {
    webp: '/imagine/previews/default-plakat-preview.webp',
    png: '/imagine/previews/default-plakat-preview.png',
  },
};
