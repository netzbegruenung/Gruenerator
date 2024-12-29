import { lazy } from 'react';

const PRELOAD_DELAY = 2000; 
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
  WahlpruefsteinThueringen: withImmedatePreloading(() => import('./WahlpruefsteinThueringen')),
  Kandidat: withImmedatePreloading(() => import('./Kandidatengenerator'))
};

// Nur häufig genutzte Module vorladen
const CRITICAL_MODULES = ['SocialMedia', 'Pressemitteilung'];

export const preloadCriticalModules = () => {
  setTimeout(() => {
    CRITICAL_MODULES.forEach(module => {
      GrueneratorenBundle[module].preload();
    });
  }, PRELOAD_DELAY);
};

// Führe preload direkt aus
preloadCriticalModules();

export const preloadAllGrueneratoren = () => {
  Object.values(GrueneratorenBundle).forEach(component => {
    component.preload();
  });
};