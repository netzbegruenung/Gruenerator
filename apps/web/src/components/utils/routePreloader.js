// Definiere verwandte Module und ihre Beziehungen
export const ROUTE_RELATIONSHIPS = {
  '/antrag': {
    immediate: ['Pressemitteilung'], // Sofort laden
    delayed: ['Rede', 'SocialMedia'], // Mit Verzögerung laden
    styles: ['typography', 'baseform'], // Kritische Styles
    criticalStyles: {
      fontFamily: "'PT Sans', Arial, sans-serif",
      typography: true,
    },
  },
  '/pressemitteilung': {
    immediate: ['SocialMedia'],
    delayed: ['Antrag', 'Sharepic'],
    styles: ['typography', 'baseform'],
  },
  '/socialmedia': {
    immediate: ['Sharepic'],
    delayed: ['Pressemitteilung'],
    styles: ['typography', 'baseform'],
  },
  '/image-studio': {
    immediate: ['SocialMedia'],
    delayed: [],
    styles: ['typography', 'imagemodificator'],
  },
  '/image-studio/templates': {
    immediate: ['SocialMedia'],
    delayed: [],
    styles: ['typography', 'imagemodificator'],
  },
  '/image-studio/ki': {
    immediate: ['SocialMedia'],
    delayed: [],
    styles: ['typography', 'imagemodificator'],
  },
  '/rede': {
    immediate: ['Antrag'],
    delayed: ['Pressemitteilung'],
    styles: ['typography', 'baseform'],
  },
  '/wahlprogramm': {
    immediate: [],
    delayed: [],
    styles: ['typography', 'baseform'],
  },
};

// Neue Hilfsfunktion für Style-Management
export const getCriticalStyles = (pathname) => {
  const route = ROUTE_RELATIONSHIPS[pathname];
  return {
    ...(route?.criticalStyles || {}),
    fontFamily: "'PT Sans', Arial, sans-serif",
    typography: true,
    preloadFonts: true,
  };
};

export const preloadFonts = () => {
  const fonts = [
    { path: '../../fonts/PTSans-Regular.woff2', type: 'font/woff2' },
    { path: '../../fonts/PTSans-Bold.woff2', type: 'font/woff2' },
    { path: '../../fonts/PTSans-Italic.woff2', type: 'font/woff2' },
    { path: '../../fonts/GrueneType.woff2', type: 'font/woff2' },
  ];

  fonts.forEach((font) => {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'font';
    link.type = font.type;
    link.href = font.path;
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  });
};
