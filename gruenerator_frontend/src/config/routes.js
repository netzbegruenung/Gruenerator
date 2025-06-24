import { lazy } from 'react';
// Statische Importe in dynamische umwandeln
const UniversalTextGenerator = lazy(() => import('../features/texte/universal/UniversalTextGenerator'));
const AntragPage = lazy(() => import('../features/texte/antrag/AntragPage'));
const AntraegeGallery = lazy(() => import('../features/templates/antraege/AntraegeGallery'));
const AntragDetailPage = lazy(() => import('../features/templates/antraege/AntragDetailPage'));
const YouPage = lazy(() => import('../features/you'));
// EmptyEditor removed - deprecated component
const CustomGeneratorPage = lazy(() => import('../features/generators/CustomGeneratorPage'));
const CreateCustomGeneratorPage = lazy(() => import('../features/generators/CreateCustomGeneratorPage'));
const CampaignPage = lazy(() => import('../features/campaigns'));
const WebinarCampaign = lazy(() => import('../features/campaigns/components/WebinarCampaign'));

// Auth-Komponenten importieren (only components still used after Authentic integration)
const LoginPage = lazy(() => import('../features/auth/pages/LoginPage'));
const LoggedOutPage = lazy(() => import('../features/auth/pages/LoggedOutPage'));
const ProfilePage = lazy(() => import('../features/auth/pages/ProfilePage'));
const RegistrationPage = lazy(() => import('../features/auth/pages/RegistrationPage'));

// Gruppen-Komponente importieren
const JoinGroupPage = lazy(() => import('../features/groups/pages/JoinGroupPage'));

// Lazy loading für statische Seiten
const Home = lazy(() => import('../components/pages/Home'));
const Datenschutz = lazy(() => import('../components/pages/Impressum_Datenschutz_Terms/Datenschutz'));
const Impressum = lazy(() => import('../components/pages/Impressum_Datenschutz_Terms/Impressum'));
const NotFound = lazy(() => import('../components/pages/NotFound'));
const Search = lazy(() => import('../features/search/components/SearchPage'));
const AskPage = lazy(() => import('../features/ask/AskPage'));
const AskGrundsatzPage = lazy(() => import('../features/ask/AskGrundsatzPage'));
const DocumentViewPage = lazy(() => import('../features/documents/DocumentViewPage'));
const Reel = lazy(() => import('../features/subtitler/components/SubtitlerPage'));
const PresseSocialGenerator = lazy(() => import('../features/texte/presse/PresseSocialGenerator'));

// ContentGallery importieren
const ContentGallery = lazy(() => import('../components/common/Gallery/ContentGallery'));

// NEU: CollabEditorPage importieren (Lazy Loading)
const CollabEditorPage = lazy(() => import('../pages/CollabEditorPage/CollabEditorPage'));


// Q&A Chat Komponente importieren
const QAChat = lazy(() => import('../features/qa/components/QAChat'));

// Test-Komponenten importieren
const ButtonTest = lazy(() => import('../components/test/ButtonTest'));

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
  Ask: AskPage,
  AskGrundsatz: AskGrundsatzPage,
  DocumentView: DocumentViewPage,
  AntraegeListe: AntraegeGallery,
  AntragDetail: AntragDetailPage,
  Reel: Reel,
  You: YouPage,
  Campaign: CampaignPage,
  Webinar: WebinarCampaign,
  // EmptyEditor: EmptyEditor, // Removed - deprecated
  CustomGenerator: CustomGeneratorPage,
  CreateCustomGenerator: CreateCustomGeneratorPage,
  ContentGallery: ContentGallery,
  QAChat: QAChat
};

// Route Konfigurationen
const standardRoutes = [
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
  { path: '/datenbank/antraege', component: GrueneratorenBundle.AntraegeListe },
  { path: '/datenbank/antraege/:antragId', component: GrueneratorenBundle.AntragDetail },
  { path: '/suche', component: GrueneratorenBundle.Search, withForm: true },
  { path: '/ask', component: GrueneratorenBundle.Ask, withForm: true },
  { path: '/ask-grundsatz', component: GrueneratorenBundle.AskGrundsatz, withForm: true },
  { path: '/documents/:documentId', component: GrueneratorenBundle.DocumentView },
  { path: '/reel', component: GrueneratorenBundle.Reel },
  { path: '/you', component: GrueneratorenBundle.You, withForm: true },
  { path: '/kampagne', component: GrueneratorenBundle.Campaign },
  { path: '/webinare', component: GrueneratorenBundle.Webinar },
  // { path: '/editor', component: GrueneratorenBundle.EmptyEditor, withForm: true }, // Removed - deprecated
  { path: '/generator/:slug', component: GrueneratorenBundle.CustomGenerator, withForm: true },
  { path: '/create-generator', component: GrueneratorenBundle.CreateCustomGenerator, withForm: true },
  { path: '/datenschutz', component: Datenschutz },
  { path: '/impressum', component: Impressum },
  // Auth-Routen (only components still used after Authentic integration)
  { path: '/login', component: LoginPage },
  { path: '/register', component: RegistrationPage },
  { path: '/logged-out', component: LoggedOutPage },
  { path: '/profile', component: ProfilePage },
  { path: '/profile/:tab', component: ProfilePage },
  // Note: Other auth routes (password reset, email verification, MFA, etc.) are now handled by Authentic
  // Gruppen-Route
  { path: '/join-group/:joinToken', component: JoinGroupPage },
  { path: '/datenbank', component: GrueneratorenBundle.ContentGallery },
  // NEU: Route für CollabEditorPage
  { path: '/editor/collab/:documentId', component: CollabEditorPage, showHeaderFooter: false }, // showHeaderFooter: false, da eigener Header
  // NEU: Route für Preview-Modus (mit /preview suffix)
  { path: '/editor/collab/:documentId/preview', component: CollabEditorPage, showHeaderFooter: false }, // Preview-Modus ohne Header/Footer
  // Q&A Chat Routen
  { path: '/qa/:id', component: GrueneratorenBundle.QAChat },
  { path: '/button-test', component: ButtonTest },
  { path: '*', component: NotFound }
];

const specialRoutes = [
  { 
    path: '/sharepic', 
    component: GrueneratorenBundle.Sharepic, 
    withForm: true, 
    withSharepic: true 
  }
];

// Hilfsfunktion zum Erstellen der No-Header-Footer-Variante
const createNoHeaderFooterRoute = (route) => {
  // Nur die 404-Route und Linktree-Route ausschließen
  if (route.path === '*') return null;
  
  const noHeaderPath = route.path === '/' 
    ? '/no-header-footer'
    : `${route.path}-no-header-footer`;

  return {
    ...route,
    path: noHeaderPath,
    showHeaderFooter: false
  };
};

export const routes = {
  standard: standardRoutes,
  special: specialRoutes,
  noHeaderFooter: [
    ...standardRoutes.map(createNoHeaderFooterRoute).filter(Boolean).filter(route => route.path !== '/editor/collab/:documentId-no-header-footer'), // Verhindere doppelte no-header-footer Route
    ...specialRoutes.map(createNoHeaderFooterRoute).filter(Boolean)
  ]
};

export default routes;