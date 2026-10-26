import { BRAND_WEB_FONT_FACES, brandFontUrl, type BrandFontFile } from '@gruenerator/contracts';

/**
 * The brand faces the API serves from the private content checkout. They are
 * declared here rather than in typography.css because the URL hangs off the API
 * base, which is relative on the web (`/api`) and absolute in the desktop build.
 */
export function brandFontFaceCss(urlFor: (file: BrandFontFile) => string): string {
  return BRAND_WEB_FONT_FACES.map(
    (face) => `@font-face {
  font-family: '${face.family}';
  src: url('${urlFor(face.woff2)}') format('woff2'), url('${urlFor(face.woff)}') format('woff');
  font-weight: normal;
  font-style: normal;
  font-display: swap;
}`
  ).join('\n');
}

/** Before the first render, so canvas measurement never sees a missing family. */
export function installBrandFonts(
  urlFor: (file: BrandFontFile) => string = (file) =>
    brandFontUrl((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api', file)
): void {
  const style = document.createElement('style');
  style.dataset.brandFonts = '';
  style.textContent = brandFontFaceCss(urlFor);
  document.head.appendChild(style);
}
