import { lazy } from 'react';

const PRELOAD_DELAY = 2000; // 2 Sekunden nach App-Start

const withImmedatePreloading = (importFunc) => {
  // Sofortiges Laden des Moduls
  const modulePromise = importFunc();

  // Erstelle die lazy-geladene Komponente
  const LazyComponent = lazy(() => modulePromise);

  // Füge preload-Methode hinzu
  LazyComponent.preload = () => modulePromise;

  return LazyComponent;
};

export const GrueneratorenBundle = {
  Antrag: withImmedatePreloading(() => import('./Antragsgenerator')),
  Pressemitteilung: withImmedatePreloading(() => import('./Pressemitteilung')),
  SocialMedia: withImmedatePreloading(() => import('./SocialMediaGenerator')),
  Sharepic: withImmedatePreloading(() => import('./Sharepicgenerator')),
  Rede: withImmedatePreloading(() => import('./Redengenerator')),
  Wahlprogramm: withImmedatePreloading(() => import('./Wahlprogramm')),
  Antragsversteher: withImmedatePreloading(() => import('./Antragsversteher')),
  WahlpruefsteinThueringen: withImmedatePreloading(() => import('./WahlpruefsteinThueringen'))
};

// Sofortiges Vorladen aller Grüneratoren
export const preloadAllGrueneratoren = () => {
  setTimeout(() => {
    Object.values(GrueneratorenBundle).forEach(component => {
      component.preload();
    });
  }, PRELOAD_DELAY);
};

// Führe preload direkt aus
preloadAllGrueneratoren();