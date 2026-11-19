import { type BrandFontFile, type SupportedLocale } from '@gruenerator/contracts';

export const SITE_BUNDLED_FONT_FILES = [
  'PTSans-Regular.woff2',
  'PTSans-Bold.woff2',
  'PTSans-Italic.woff2',
] as const;

export type SiteFontFile = BrandFontFile | (typeof SITE_BUNDLED_FONT_FILES)[number];

interface Face {
  family: 'GrSite Display' | 'GrSite Text';
  weight: 400 | 700;
  style: 'normal' | 'italic';
  woff2: SiteFontFile;
  woff: SiteFontFile | null;
}

const FACES: Record<SupportedLocale, readonly Face[]> = {
  'de-DE': [
    {
      family: 'GrSite Display',
      weight: 400,
      style: 'normal',
      woff2: 'GrueneTypeNeue-Regular.woff2',
      woff: 'GrueneTypeNeue-Regular.woff',
    },
    {
      family: 'GrSite Text',
      weight: 400,
      style: 'normal',
      woff2: 'PTSans-Regular.woff2',
      woff: null,
    },
    { family: 'GrSite Text', weight: 700, style: 'normal', woff2: 'PTSans-Bold.woff2', woff: null },
    {
      family: 'GrSite Text',
      weight: 400,
      style: 'italic',
      woff2: 'PTSans-Italic.woff2',
      woff: null,
    },
  ],
  'de-AT': [
    {
      family: 'GrSite Display',
      weight: 400,
      style: 'normal',
      woff2: 'GothamNarrow-Ultra.woff2',
      woff: 'GothamNarrow-Ultra.woff',
    },
    {
      family: 'GrSite Text',
      weight: 400,
      style: 'normal',
      woff2: 'GothamNarrow-Book.woff2',
      woff: 'GothamNarrow-Book.woff',
    },
    {
      family: 'GrSite Text',
      weight: 700,
      style: 'normal',
      woff2: 'GothamNarrow-Bold.woff2',
      woff: 'GothamNarrow-Bold.woff',
    },
  ],
};

export function siteFontFiles(locale: SupportedLocale): readonly SiteFontFile[] {
  return FACES[locale].flatMap((face) => (face.woff ? [face.woff2, face.woff] : [face.woff2]));
}

export function siteFontPreloads(locale: SupportedLocale): readonly SiteFontFile[] {
  const faces = FACES[locale];
  const display = faces.find((f) => f.family === 'GrSite Display');
  const text = faces.find(
    (f) => f.family === 'GrSite Text' && f.weight === 400 && f.style === 'normal'
  );
  return [display, text].flatMap((f) => (f ? [f.woff2] : []));
}

function safeUrl(url: string): string {
  // eslint-disable-next-line no-control-regex
  if (/["'\\()\u0000-\u001f]/.test(url)) throw new Error('unsafe font url');
  return url;
}

export function siteFontFaceCss(
  locale: SupportedLocale,
  fontUrl: (file: SiteFontFile) => string
): string {
  return FACES[locale]
    .map((face) => {
      const sources = [`url("${safeUrl(fontUrl(face.woff2))}") format("woff2")`];
      if (face.woff) sources.push(`url("${safeUrl(fontUrl(face.woff))}") format("woff")`);
      return `@font-face{font-family:"${face.family}";src:${sources.join(',')};font-weight:${face.weight};font-style:${face.style};font-display:swap}`;
    })
    .join('\n');
}
