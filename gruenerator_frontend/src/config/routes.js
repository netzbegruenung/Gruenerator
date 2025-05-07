import { lazy } from 'react';
// Statische Importe in dynamische umwandeln
const CanvaTemplateGallery = lazy(() => import('../features/templates/canva'));
const UniversalTextGenerator = lazy(() => import('../features/texte/universal/UniversalTextGenerator'));
const AntragPage = lazy(() => import('../features/texte/antrag/AntragPage'));
// TODO: Eine Komponente zur Anzeige der Antragsliste erstellen und importieren
// const AntraegeListe = lazy(() => import('../features/antraege/AntraegeListe')); 
const AntraegeGallery = lazy(() => import('../features/templates/antraege/AntraegeGallery'));
const AntragDetailPage = lazy(() => import('../features/templates/antraege/AntragDetailPage'));
const YouPage = lazy(() => import('../features/you'));
const EmptyEditor = lazy(() => import('../features/texte/editor/EmptyEditor'));
const CustomGeneratorPage = lazy(() => import('../features/generators/CustomGeneratorPage'));
// Import der neuen Seite zum Erstellen von Generatoren
const CreateCustomGeneratorPage = lazy(() => import('../features/generators/CreateCustomGeneratorPage'));
// Temporär auskommentiert, bis die Datei existiert oder der Pfad korrigiert ist
// import LinkTreeRoutes from '../features/linktree/LinkTreeRoutes';
const CampaignPage = lazy(() => import('../features/campaigns'));
const WebinarCampaign = lazy(() => import('../features/campaigns/components/WebinarCampaign'));

// Auth-Komponenten importieren
const LoginPage = lazy(() => import('../features/auth/pages/LoginPage'));
const RegistrationPage = lazy(() => import('../features/auth/pages/RegistrationPage'));
const RequestPasswordResetPage = lazy(() => import('../features/auth/pages/RequestPasswordResetPage'));
const ResetPasswordPage = lazy(() => import('../features/auth/pages/ResetPasswordPage'));
// Zusätzliche Auth-Komponenten importieren
const EmailVerificationPage = lazy(() => import('../features/auth/pages/EmailVerificationPage'));
const ConfirmEmailPage = lazy(() => import('../features/auth/pages/ConfirmEmailPage'));
const ProfilePage = lazy(() => import('../features/auth/pages/ProfilePage'));
const AccountDeletePage = lazy(() => import('../features/auth/pages/AccountDeletePage'));
const SetupMFAPage = lazy(() => import('../features/auth/pages/SetupMFAPage'));
const MFAVerificationPage = lazy(() => import('../features/auth/pages/MFAVerificationPage'));
const OAuthCallbackPage = lazy(() => import('../features/auth/pages/OAuthCallbackPage'));
// Gruppen-Komponente importieren
const JoinGroupPage = lazy(() => import('../features/groups/pages/JoinGroupPage'));

// Lazy loading für statische Seiten
const Home = lazy(() => import('../components/pages/Home'));
const Datenschutz = lazy(() => import('../components/pages/Impressum_Datenschutz_Terms/Datenschutz'));
const Impressum = lazy(() => import('../components/pages/Impressum_Datenschutz_Terms/Impressum'));
const NotFound = lazy(() => import('../components/pages/NotFound'));
const Search = lazy(() => import('../features/search/components/SearchPage'));
const Reel = lazy(() => import('../features/subtitler/components/SubtitlerPage'));
const PresseSocialGenerator = lazy(() => import('../features/texte/presse/PresseSocialGenerator'));

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
  CanvaTemplates: CanvaTemplateGallery,
  // AntraegeListe: AntraegeListe, // Platzhalter für die zukünftige Antragslisten-Komponente
  AntraegeListe: AntraegeGallery,
  AntragDetail: AntragDetailPage,
  Reel: Reel,
  You: YouPage,
  Campaign: CampaignPage,
  Webinar: WebinarCampaign,
  EmptyEditor: EmptyEditor,
  CustomGenerator: CustomGeneratorPage,
  CreateCustomGenerator: CreateCustomGeneratorPage
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
  { path: '/datenbank/canva', component: GrueneratorenBundle.CanvaTemplates },
  { path: '/datenbank/antraege', component: GrueneratorenBundle.AntraegeListe },
  { path: '/datenbank/antraege/:antragId', component: GrueneratorenBundle.AntragDetail },
  { path: '/suche', component: GrueneratorenBundle.Search, withForm: true },
  { path: '/reel', component: GrueneratorenBundle.Reel },
  { path: '/you', component: GrueneratorenBundle.You, withForm: true },
  { path: '/kampagne', component: GrueneratorenBundle.Campaign },
  { path: '/webinare', component: GrueneratorenBundle.Webinar },
  { path: '/editor', component: GrueneratorenBundle.EmptyEditor, withForm: true },
  { path: '/generator/:slug', component: GrueneratorenBundle.CustomGenerator, withForm: true },
  { path: '/create-generator', component: GrueneratorenBundle.CreateCustomGenerator, withForm: true },
  { path: '/datenschutz', component: Datenschutz },
  { path: '/impressum', component: Impressum },
  // Auth-Routen
  { path: '/login', component: LoginPage },
  { path: '/register', component: RegistrationPage },
  { path: '/request-password-reset', component: RequestPasswordResetPage },
  { path: '/reset-password', component: ResetPasswordPage },
  // Zusätzliche Auth-Routen
  { path: '/email-verification', component: EmailVerificationPage },
  { path: '/confirm-email', component: ConfirmEmailPage },
  { path: '/profile', component: ProfilePage },
  { path: '/account-delete', component: AccountDeletePage },
  { path: '/setup-mfa', component: SetupMFAPage },
  { path: '/mfa-verification', component: MFAVerificationPage },
  { path: '/oauth-callback', component: OAuthCallbackPage },
  // Gruppen-Route
  { path: '/join-group/:joinToken', component: JoinGroupPage },
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
    ...standardRoutes.map(createNoHeaderFooterRoute).filter(Boolean),
    ...specialRoutes.map(createNoHeaderFooterRoute).filter(Boolean)
  ]
};

export default routes;