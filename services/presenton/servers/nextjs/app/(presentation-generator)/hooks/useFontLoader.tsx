export const useFontLoader = (fonts: string[]) => {
  const injectFonts = (fontUrls: string[]) => {
    fontUrls.forEach((fontUrl) => {
      if (!fontUrl) return;
      const existingStyle = document.querySelector(`style[data-font-url="${fontUrl}"]`);
      if (existingStyle) return;
      const style = document.createElement('style');
      style.setAttribute('data-font-url', fontUrl);

      const isWoff = /\.(woff2?|ttf|otf|eot)(\?|$)/i.test(fontUrl);
      if (isWoff) {
        const ext = fontUrl.match(/\.(woff2|woff|ttf|otf|eot)/i)?.[1] || 'woff2';
        const formatMap: Record<string, string> = {
          woff2: 'woff2',
          woff: 'woff',
          ttf: 'truetype',
          otf: 'opentype',
          eot: 'embedded-opentype',
        };
        style.textContent = `@font-face { font-family: 'CustomFont'; src: url('${fontUrl}') format('${formatMap[ext]}'); font-display: swap; }`;
      } else {
        style.textContent = `@import url('${fontUrl}');`;
      }

      document.head.appendChild(style);
    });
  };
  injectFonts(fonts);
};
