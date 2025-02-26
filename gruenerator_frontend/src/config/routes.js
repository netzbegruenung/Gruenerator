import { lazy } from 'react';
import TemplateGallery from '../features/templates';
import { PresseSocialGenerator } from '../features/texte/presse';
import UniversalTextGenerator from '../features/texte/universal/UniversalTextGenerator';
import AntragPage from '../features/texte/antrag/AntragPage';

// Lazy loading für statische Seiten
const Home = lazy(() => import('../components/pages/Home'));
const Datenschutz = lazy(() => import('../components/pages/Impressum_Datenschutz_Terms/Datenschutz'));
const Impressum = lazy(() => import('../components/pages/Impressum_Datenschutz_Terms/Impressum'));
const NotFound = lazy(() => import('../components/pages/NotFound'));
const Search = lazy(() => import('../features/search/components/SearchPage'));
const Reel = lazy(() => import('../features/subtitler/components/SubtitlerPage'));

// Lazy loading für Grüneratoren Bundle
export const GrueneratorenBundle = {
  Universal: UniversalTextGenerator,
  Antrag: AntragPage,
  PresseSocial: PresseSocialGenerator,
  GrueneJugend: lazy(() => import('../components/pages/Grüneratoren/GrueneJugendGenerator')),
  Sharepic: lazy(() => import('../components/pages/Grüneratoren/Sharepicgenerator')),
  Antragscheck: lazy(() => import('../components/pages/Grüneratoren/Antragsversteher')),
  BTWKompass: lazy(() => import('../components/pages/Grüneratoren/WahlpruefsteinBundestagswahl')),
  Rede: UniversalTextGenerator,
  Wahlprogramm: UniversalTextGenerator,
  Kandidat: lazy(() => import('../components/pages/Grüneratoren/Kandidatengenerator')),
  Search: Search,
  Templates: TemplateGallery,
  Reel: Reel
};

// Route Konfigurationen
export const routes = {
  standard: [
    { path: '/', component: Home },
    { path: '/universal', component: GrueneratorenBundle.Universal, withForm: true },
    { path: '/antrag', component: GrueneratorenBundle.Antrag, withForm: true },
    { path: '/presse-social', component: GrueneratorenBundle.PresseSocial, withForm: true },
    { path: '/gruene-jugend', component: GrueneratorenBundle.GrueneJugend, withForm: true },
    { path: '/antragscheck', component: GrueneratorenBundle.Antragscheck, withForm: true },
    { path: '/btw-kompass', component: GrueneratorenBundle.BTWKompass, withForm: true },
    { path: '/rede', component: GrueneratorenBundle.Rede, withForm: true },
    { path: '/wahlprogramm', component: GrueneratorenBundle.Wahlprogramm, withForm: true },
    { path: '/kandidat', component: GrueneratorenBundle.Kandidat, withForm: true },
    { path: '/vorlagen', component: GrueneratorenBundle.Templates },
    { path: '/suche', component: GrueneratorenBundle.Search, withForm: true },
    { path: '/reel', component: GrueneratorenBundle.Reel },
    { path: '/datenschutz', component: Datenschutz },
    { path: '/impressum', component: Impressum },
    { path: '*', component: NotFound }
  ],
  special: [
    { 
      path: '/sharepic', 
      component: GrueneratorenBundle.Sharepic, 
      withForm: true, 
      withSharepic: true 
    }
  ],
  noHeaderFooter: Object.entries(GrueneratorenBundle).map(([key, component]) => {
    // Spezielle URL-Transformationen
    const specialPaths = {
      'BTWKompass': 'btw-kompass'
    };

    const basePath = specialPaths[key] || key.toLowerCase().replace(/[äöüß]/g, (match) => {
      const replacements = { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss' };
      return replacements[match];
    });

    return {
      path: `/${basePath}-no-header-footer`,
      component: component,
      showHeaderFooter: false,
      withForm: true
    };
  })
};

export default routes;