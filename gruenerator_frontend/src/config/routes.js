import { lazy } from 'react';

// Lazy loading für statische Seiten
const Home = lazy(() => import('../components/pages/Home'));
const Webbaukasten = lazy(() => import('../components/pages/Webbaukasten'));
const Datenschutz = lazy(() => import('../components/pages/Impressum_Datenschutz_Terms/Datenschutz'));
const Impressum = lazy(() => import('../components/pages/Impressum_Datenschutz_Terms/Impressum'));
const Gruenerator_Editor = lazy(() => import('../components/pages/Gruenerator_Editor'));
const SupabaseTest = lazy(() => import('../components/utils/SupabaseTest'));

// Lazy loading für Grüneratoren Bundle
export const GrueneratorenBundle = {
  Antrag: lazy(() => import('../components/pages/Grüneratoren/Antragsgenerator')),
  Pressemitteilung: lazy(() => import('../components/pages/Grüneratoren/Pressemitteilung')),
  SocialMedia: lazy(() => import('../components/pages/Grüneratoren/SocialMediaGenerator')),
  Sharepic: lazy(() => import('../components/pages/Grüneratoren/Sharepicgenerator')),
  Antragscheck: lazy(() => import('../components/pages/Grüneratoren/Antragsversteher')),
  WahlpruefsteinThueringen: lazy(() => import('../components/pages/Grüneratoren/WahlpruefsteinThueringen')),
  Rede: lazy(() => import('../components/pages/Grüneratoren/Redengenerator')),
  Wahlprogramm: lazy(() => import('../components/pages/Grüneratoren/Wahlprogramm'))
};

// Route Konfigurationen
export const routes = {
  standard: [
    { path: '/', component: Home },
    { path: '/antrag', component: GrueneratorenBundle.Antrag, withForm: true },
    { path: '/pressemitteilung', component: GrueneratorenBundle.Pressemitteilung, withForm: true },
    { path: '/socialmedia', component: GrueneratorenBundle.SocialMedia, withForm: true },
    { path: '/webbaukasten', component: Webbaukasten },
    { path: '/antragscheck', component: GrueneratorenBundle.Antragscheck, withForm: true },
    { path: '/wahlpruefsteinthueringen', component: GrueneratorenBundle.WahlpruefsteinThueringen },
    { path: '/rede', component: GrueneratorenBundle.Rede, withForm: true },
    { path: '/wahlprogramm', component: GrueneratorenBundle.Wahlprogramm, withForm: true },
    { path: '/datenschutz', component: Datenschutz },
    { path: '/impressum', component: Impressum }
  ],
  special: [
    { 
      path: '/sharepicgenerator', 
      component: GrueneratorenBundle.Sharepic, 
      withForm: true, 
      withSharepic: true 
    },
    { 
      path: '/ae/:linkName', 
      component: Gruenerator_Editor, 
      withForm: true, 
      isEditor: true 
    },
    { 
      path: '/supabase-test', 
      component: SupabaseTest, 
      isSpecial: true 
    }
  ],
  noHeaderFooter: Object.entries(GrueneratorenBundle).map(([key]) => ({
    path: `/${key.toLowerCase()}-no-header-footer`,
    component: GrueneratorenBundle[key],
    showHeaderFooter: false
  }))
};

export default routes;