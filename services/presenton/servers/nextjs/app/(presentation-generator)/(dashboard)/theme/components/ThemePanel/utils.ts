import { FONT_OPTIONS } from './constants';

export const loadFont = (fontFamily: string) => {
  const existingStyle = document.querySelector(`style[data-font-family="${fontFamily}"]`);
  if (existingStyle) return;

  const fontOption = FONT_OPTIONS.find((f) => f.name === fontFamily);
  if (!fontOption) return;

  const url = fontOption.cssUrl;
  const isDirectFile = /\.(woff2?|ttf|otf|eot)(\?|$)/i.test(url);

  if (isDirectFile) {
    const ext = url.match(/\.(woff2|woff|ttf|otf|eot)/i)?.[1] || 'woff2';
    const formatMap: Record<string, string> = {
      woff2: 'woff2',
      woff: 'woff',
      ttf: 'truetype',
      otf: 'opentype',
      eot: 'embedded-opentype',
    };
    const style = document.createElement('style');
    style.setAttribute('data-font-family', fontFamily);
    style.textContent = `@font-face { font-family: '${fontFamily}'; src: url('${url}') format('${formatMap[ext]}'); font-display: swap; }`;
    document.head.appendChild(style);
  } else {
    const link = document.createElement('link');
    link.href = url;
    link.rel = 'stylesheet';
    link.setAttribute('data-font-family', fontFamily);
    document.head.appendChild(link);
  }
};
