import { lazy } from 'react';
import { PresseSocialGenerator } from '../../../features/texte/presse';

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
  PresseSocial: PresseSocialGenerator,
  Sharepic: withImmedatePreloading(() => import('./Sharepicgenerator')),
  Rede: withImmedatePreloading(() => import('../../../features/texte/universal/UniversalTextGenerator')),
  Wahlprogramm: withImmedatePreloading(() => import('../../../features/texte/universal/UniversalTextGenerator')),
  Antragsversteher: withImmedatePreloading(() => import('./Antragsversteher')),
  Kandidat: withImmedatePreloading(() => import('./Kandidatengenerator'))
};

// Nur häufig genutzte Module vorladen
const CRITICAL_MODULES = ['PresseSocial'];

export const preloadCriticalModules = () => {
  setTimeout(() => {
    CRITICAL_MODULES.forEach(module => {
      if (GrueneratorenBundle[module].preload) {
        GrueneratorenBundle[module].preload();
      }
    });
  }, PRELOAD_DELAY);
};

// Führe preload direkt aus
preloadCriticalModules();

export const preloadAllGrueneratoren = () => {
  Object.values(GrueneratorenBundle).forEach(component => {
    if (component.preload) {
      component.preload();
    }
  });
};