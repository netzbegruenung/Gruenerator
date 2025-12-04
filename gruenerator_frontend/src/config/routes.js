import { lazy } from 'react';
// Statische Importe in dynamische umwandeln
const UniversalTextGenerator = lazy(() => import('../features/texte/universal/UniversalTextGenerator'));
const AntragPage = lazy(() => import('../features/texte/antrag/AntragPage'));
const GalleryPage = lazy(() => import('../components/common/Gallery'));
const AntragDetailPage = lazy(() => import('../features/templates/antraege/AntragDetailPage'));
const YouPage = lazy(() => import('../features/you'));
// EmptyEditor removed - deprecated component
const CustomGeneratorPage = lazy(() => import('../features/generators/CustomGeneratorPage'));
const CampaignPage = lazy(() => import('../features/campaigns'));
const WebinarCampaign = lazy(() => import('../features/campaigns/components/WebinarCampaign'));

// Auth-Komponenten importieren (only components still used after Authentic integration)
const LoginPage = lazy(() => import('../features/auth/pages/LoginPage'));
const ProfilePage = lazy(() => import('../features/auth/pages/ProfilePage'));
const RegistrationPage = lazy(() => import('../features/auth/pages/RegistrationPage'));

// Gruppen-Komponente importieren
const JoinGroupPage = lazy(() => import('../features/groups/pages/JoinGroupPage'));

// Lazy loading für statische Seiten
const Home = lazy(() => import('../components/pages/Startseite'));
const Datenschutz = lazy(() => import('../components/pages/Impressum_Datenschutz_Terms/Datenschutz'));
const Impressum = lazy(() => import('../components/pages/Impressum_Datenschutz_Terms/Impressum'));
const Support = lazy(() => import('../components/pages/Impressum_Datenschutz_Terms/Support'));
const NotFound = lazy(() => import('../components/pages/NotFound'));
const Search = lazy(() => import('../features/search/components/SearchPage'));
const BundestagSearch = lazy(() => import('../features/bundestag/components/BundestagSearchPage'));
const AskPage = lazy(() => import('../features/ask/AskPage'));
const AskGrundsatzPage = lazy(() => import('../features/ask/AskGrundsatzPage'));
const AskBundestagsfraktionPage = lazy(() => import('../features/ask/AskBundestagsfraktionPage'));
const AskGrueneratorPage = lazy(() => import('../features/ask/AskGrueneratorPage'));
const DocumentViewPage = lazy(() => import('../features/documents/DocumentViewPage'));
const Reel = lazy(() => import('../features/subtitler/components/SubtitlerPage'));
const SharedVideoPage = lazy(() => import('../features/subtitler/components/SharedVideoPage'));
const PresseSocialGenerator = lazy(() => import('../features/texte/presse/PresseSocialGenerator'));
const KampagnenGenerator = lazy(() => import('../features/texte/kampagnen/KampagnenGenerator'));
const GrueneratorImagine = lazy(() => import('../features/imagine/GrueneratorImagine'));
const AccessibilityTextGenerator = lazy(() => import('../features/texte/accessibility/AccessibilityTextGenerator'));
const AltTextGenerator = lazy(() => import('../features/texte/alttext/AltTextGenerator'));
const SurveyIndex = lazy(() => import('../features/umfragen'));
const SurveyPage = lazy(() => import('../features/umfragen').then(module => ({ default: module.SurveyPage })));


// NEU: CollabEditorPage importieren (Lazy Loading) - DISABLED - Feature removed, backup available in archive/collab-feature-backup-2025-01
// const CollabEditorPage = lazy(() => import('../pages/CollabEditorPage/CollabEditorPage'));


// Q&A Chat Komponente importieren
const QAChat = lazy(() => import('../features/qa/components/QAChat'));

// Grünerator Chat Komponente importieren
const GrueneratorChat = lazy(() => import('../features/chat/components/GrueneratorChat'));

// Beta Feature Wrapper importieren
const BetaFeatureWrapper = lazy(() => import('../components/common/BetaFeatureWrapper'));

// Wrapped Chat Component für Beta Feature
const WrappedGrueneratorChat = lazy(() =>
  Promise.all([
    import('../features/chat/components/GrueneratorChat'),
    import('../components/common/BetaFeatureWrapper')
  ]).then(([chatModule, wrapperModule]) => ({
    default: (props) => (
      wrapperModule.default({
        children: chatModule.default(props),
        featureKey: 'chat',
        fallbackPath: '/profile?tab=labor'
      })
    )
  }))
);

// E-Learning Komponente importieren
const ELearningPage = lazy(() => import('../features/elearning'));
// ELearningTutorial component doesn't exist - using ELearningPage instead

// Test-Komponenten importieren (disabled - component not found)
// const ButtonTest = lazy(() => import('../components/test/ButtonTest'));

// Pages-Feature importieren
const DynamicPageView = lazy(() => import('../features/pages/components/DynamicPageView'));
const StructuredExamplePage = lazy(() => import('../features/pages/ExamplePage').then(module => ({ default: module.StructuredExamplePage })));
const CustomExamplePage = lazy(() => import('../features/pages/ExamplePage').then(module => ({ default: module.CustomExamplePage })));

// Lazy loading für Grüneratoren Bundle
export const GrueneratorenBundle = {
  Universal: UniversalTextGenerator,
  Antrag: AntragPage,
  PresseSocial: PresseSocialGenerator,
  Kampagnen: KampagnenGenerator,
  Accessibility: AccessibilityTextGenerator,
  AltText: AltTextGenerator,
  Imagine: GrueneratorImagine,
  GrueneJugend: lazy(() => import('../components/pages/Grüneratoren/GrueneJugendGenerator')),
  Sharepic: lazy(() => import('../components/pages/Grüneratoren/Sharepicgenerator')),
  Antragscheck: lazy(() => import('../components/pages/Grüneratoren/Antragsversteher')),
  Rede: UniversalTextGenerator,
  Wahlprogramm: UniversalTextGenerator,
  Search: Search,
  BundestagSearch: BundestagSearch,
  Ask: AskPage,
  AskGrundsatz: AskGrundsatzPage,
  AskBundestagsfraktion: AskBundestagsfraktionPage,
  AskGruenerator: AskGrueneratorPage,
  DocumentView: DocumentViewPage,
  AntraegeListe: GalleryPage,
  AntragDetail: AntragDetailPage,
  Reel: Reel,
  You: YouPage,
  Campaign: CampaignPage,
  Webinar: WebinarCampaign,
  // EmptyEditor: EmptyEditor, // Removed - deprecated
  CustomGenerator: CustomGeneratorPage,
  QAChat: QAChat,
  Chat: WrappedGrueneratorChat,
  ELearning: ELearningPage,
  ELearningTutorial: ELearningPage,
  DynamicPageView: DynamicPageView,
  StructuredExamplePage: StructuredExamplePage,
  CustomExamplePage: CustomExamplePage,
  SurveyIndex: SurveyIndex,
  SurveyPage: SurveyPage
};

// Route Konfigurationen
const standardRoutes = [
  { path: '/', component: Home },
  { path: '/universal', component: GrueneratorenBundle.Universal, withForm: true },
  { path: '/antrag', component: GrueneratorenBundle.Antrag, withForm: true },
  { path: '/presse-social', component: GrueneratorenBundle.PresseSocial, withForm: true },
  { path: '/kampagnen', component: GrueneratorenBundle.Kampagnen, withForm: true },
  { path: '/imagine', component: GrueneratorenBundle.Imagine, withForm: true },
  { path: '/barrierefreiheit', component: GrueneratorenBundle.Accessibility, withForm: true },
  { path: '/alttext', component: GrueneratorenBundle.AltText, withForm: true },
  { path: '/gruene-jugend', component: GrueneratorenBundle.GrueneJugend, withForm: true },
  { path: '/antragscheck', component: GrueneratorenBundle.Antragscheck, withForm: true },
  { path: '/rede', component: GrueneratorenBundle.Rede, withForm: true },
  { path: '/buergerinnenanfragen', component: GrueneratorenBundle.Universal, withForm: true },
  { path: '/wahlprogramm', component: GrueneratorenBundle.Wahlprogramm, withForm: true },
  { path: '/datenbank/antraege', component: GrueneratorenBundle.AntraegeListe },
  { path: '/datenbank/antraege/:antragId', component: GrueneratorenBundle.AntragDetail },
  { path: '/suche', component: GrueneratorenBundle.Search, withForm: true },
  { path: '/bundestag', component: GrueneratorenBundle.BundestagSearch, withForm: true },
  { path: '/ask', component: GrueneratorenBundle.Ask, withForm: true },
  { path: '/gruene-notebook', component: GrueneratorenBundle.AskGrundsatz, withForm: true },
  { path: '/gruene-bundestag', component: GrueneratorenBundle.AskBundestagsfraktion, withForm: true },
  { path: '/gruenerator-notebook', component: GrueneratorenBundle.AskGruenerator, withForm: true },
  { path: '/documents/:documentId', component: GrueneratorenBundle.DocumentView },
  { path: '/reel', component: GrueneratorenBundle.Reel },
  { path: '/subtitler/share/:shareToken', component: SharedVideoPage, showHeaderFooter: false },
  { path: '/you', component: GrueneratorenBundle.You, withForm: true },
  { path: '/kampagne', component: GrueneratorenBundle.Campaign },
  { path: '/webinare', component: GrueneratorenBundle.Webinar },
  // { path: '/editor', component: GrueneratorenBundle.EmptyEditor, withForm: true }, // Removed - deprecated
  { path: '/gruenerator/:slug', component: GrueneratorenBundle.CustomGenerator, withForm: true },
  { path: '/datenschutz', component: Datenschutz },
  { path: '/impressum', component: Impressum },
  { path: '/support', component: Support },
  // Auth-Routen (only components still used after Authentic integration)
  { path: '/login', component: LoginPage },
  { path: '/register', component: RegistrationPage },
  { path: '/profile', component: ProfilePage },
  { path: '/profile/:tab', component: ProfilePage },
  { path: '/profile/:tab/:subtab', component: ProfilePage },
  { path: '/profile/:tab/:subtab/:subsubtab', component: ProfilePage },
  // Note: Other auth routes (password reset, email verification, MFA, etc.) are now handled by Authentic
  // Gruppen-Route
  { path: '/join-group/:joinToken', component: JoinGroupPage },
  // Removed ContentGallery route '/datenbank'
  // NEU: Route für CollabEditorPage - DISABLED - Feature removed, backup available in archive/collab-feature-backup-2025-01
  // { path: '/editor/collab/:documentId', component: CollabEditorPage, showHeaderFooter: false }, // showHeaderFooter: false, da eigener Header
  // NEU: Route für Preview-Modus (mit /preview suffix) - DISABLED
  // { path: '/editor/collab/:documentId/preview', component: CollabEditorPage, showHeaderFooter: false }, // Preview-Modus ohne Header/Footer
  // Q&A Chat Routen
  { path: '/qa/:id', component: GrueneratorenBundle.QAChat },
  // Grünerator Chat Route
  { path: '/chat', component: GrueneratorenBundle.Chat },
  // E-Learning Routes
  { path: '/e-learning', component: GrueneratorenBundle.ELearning },
  // Survey Routes
  { path: '/umfragen', component: GrueneratorenBundle.SurveyIndex },
  // Pages Feature Routes
  { path: '/pages/example-structured', component: GrueneratorenBundle.StructuredExamplePage },
  { path: '/pages/example-custom', component: GrueneratorenBundle.CustomExamplePage },
  { path: '/pages/:pageId', component: GrueneratorenBundle.DynamicPageView },
  // { path: '/button-test', component: ButtonTest },
  { path: '*', component: NotFound }
];

const specialRoutes = [
  {
    path: '/sharepic',
    component: GrueneratorenBundle.Sharepic,
    withForm: true,
    withSharepic: true
  },
  {
    path: '/sharepic/:type',
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
