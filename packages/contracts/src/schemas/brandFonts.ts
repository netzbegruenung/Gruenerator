import { z } from 'zod';

/**
 * The brand font files `GET /api/fonts/:file` serves. They live in the private
 * content checkout (`<INTERN_CONTENT_DIR>/fonts/`), not in this repo; web and
 * app request them by these exact names, so a name never changes.
 */
export const brandFontFileSchema = z.enum([
  'GrueneType.woff2',
  'GrueneType.woff',
  'GrueneType.ttf',
  'GrueneTypeNeue-Regular.woff2',
  'GrueneTypeNeue-Regular.woff',
  'GrueneTypeNeue-Regular.ttf',
  'GothamNarrow-Ultra.woff2',
  'GothamNarrow-Ultra.woff',
  'GothamNarrow-Ultra.ttf',
  'GothamNarrow-Book.woff2',
  'GothamNarrow-Book.woff',
  'GothamNarrow-Bold.woff2',
  'GothamNarrow-Bold.woff',
]);

export type BrandFontFile = z.infer<typeof brandFontFileSchema>;

/** The brand families as the web declares them with @font-face, and their files. */
export const BRAND_WEB_FONT_FACES: ReadonlyArray<{
  family: string;
  woff2: BrandFontFile;
  woff: BrandFontFile;
}> = [
  { family: 'GrueneType', woff2: 'GrueneType.woff2', woff: 'GrueneType.woff' },
  {
    family: 'GrueneTypeNeue',
    woff2: 'GrueneTypeNeue-Regular.woff2',
    woff: 'GrueneTypeNeue-Regular.woff',
  },
  {
    family: 'GothamNarrow-Ultra',
    woff2: 'GothamNarrow-Ultra.woff2',
    woff: 'GothamNarrow-Ultra.woff',
  },
  { family: 'GothamNarrow-Book', woff2: 'GothamNarrow-Book.woff2', woff: 'GothamNarrow-Book.woff' },
  { family: 'GothamNarrow-Bold', woff2: 'GothamNarrow-Bold.woff2', woff: 'GothamNarrow-Bold.woff' },
];

/** `apiBase` ends in `/api` (web: `/api`, desktop/app: `https://gruenerator.eu/api`). */
export function brandFontUrl(apiBase: string, file: BrandFontFile): string {
  return `${apiBase}/fonts/${file}`;
}
