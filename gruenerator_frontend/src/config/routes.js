import { lazy } from 'react';

// Lazy loading für statische Seiten
const Home = lazy(() => import('../components/pages/Home'));
const Datenschutz = lazy(() => import('../components/pages/Impressum_Datenschutz_Terms/Datenschutz'));
const Impressum = lazy(() => import('../components/pages/Impressum_Datenschutz_Terms/Impressum'));
const TemplateGallery = lazy(() => import('../components/pages/TemplateGallery'));

// Lazy loading für Grüneratoren Bundle
export const GrueneratorenBundle = {
  Antrag: lazy(() => import('../components/pages/Grüneratoren/Antragsgenerator')),
  Pressemitteilung: lazy(() => import('../components/pages/Grüneratoren/Pressemitteilung')),
  SocialMedia: lazy(() => import('../components/pages/Grüneratoren/SocialMediaGenerator')),
  Sharepic: lazy(() => import('../components/pages/Grüneratoren/Sharepicgenerator')),
  Antragscheck: lazy(() => import('../components/pages/Grüneratoren/Antragsversteher')),
  WahlpruefsteinThueringen: lazy(() => import('../components/pages/Grüneratoren/WahlpruefsteinThueringen')),
  WahlpruefsteinBundestagswahl: lazy(() => import('../components/pages/Grüneratoren/WahlpruefsteinBundestagswahl')),
  Rede: lazy(() => import('../components/pages/Grüneratoren/Redengenerator')),
  Wahlprogramm: lazy(() => import('../components/pages/Grüneratoren/Wahlprogramm')),
  Templates: TemplateGallery
};

// Route Konfigurationen
export const routes = {
  standard: [
    { path: '/', component: Home },
    { path: '/antrag', component: GrueneratorenBundle.Antrag, withForm: true },
    { path: '/pressemitteilung', component: GrueneratorenBundle.Pressemitteilung, withForm: true },
    { path: '/socialmedia', component: GrueneratorenBundle.SocialMedia, withForm: true },
    { path: '/antragscheck', component: GrueneratorenBundle.Antragscheck, withForm: true },
    { path: '/wahlpruefsteinthueringen', component: GrueneratorenBundle.WahlpruefsteinThueringen },
    { path: '/wahlpruefstein-bundestagswahl', component: GrueneratorenBundle.WahlpruefsteinBundestagswahl },
    { path: '/rede', component: GrueneratorenBundle.Rede, withForm: true },
    { path: '/wahlprogramm', component: GrueneratorenBundle.Wahlprogramm, withForm: true },
    { path: '/vorlagen', component: GrueneratorenBundle.Templates },
    { path: '/datenschutz', component: Datenschutz },
    { path: '/impressum', component: Impressum }
  ],
  special: [
    { 
      path: '/sharepicgenerator', 
      component: GrueneratorenBundle.Sharepic, 
      withForm: true, 
      withSharepic: true 
    }
  ],
  noHeaderFooter: Object.entries(GrueneratorenBundle).map(([key]) => ({
    path: `/${key.toLowerCase()}-no-header-footer`,
    component: GrueneratorenBundle[key],
    showHeaderFooter: false
  }))
};

export default routes;