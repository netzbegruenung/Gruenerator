import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { isDesktopApp } from '../utils/platform';

/**
 * Route configuration interface
 */
export interface RouteConfig {
  path: string;
  component: LazyExoticComponent<ComponentType<unknown>>;
  withForm?: boolean;
  showHeaderFooter?: boolean;
}

// Statische Importe in dynamische umwandeln
const UniversalTextGenerator = lazy(() => import('../features/texte/universal/UniversalTextGenerator'));
const AntragPage = lazy(() => import('../features/texte/antrag/AntragPage'));
const GalleryPage = lazy(() => import('../components/common/Gallery'));
const VorlagenGallery = lazy(() =>
  Promise.all([
    import('../components/common/Gallery'),
    import('../components/common/BetaFeatureWrapper')
  ]).then(([galleryMod, wrapperMod]) => ({
    default: (props: Record<string, unknown>) => wrapperMod.default({
      children: galleryMod.default({ ...props, initialContentType: 'vorlagen', availableContentTypes: ['vorlagen'] }),
      featureKey: 'vorlagen',
      fallbackPath: '/'
    })
  }))
);
const AntragDetailPage = lazy(() => import('../features/templates/antraege/AntragDetailPage'));
const CustomGeneratorPage = lazy(() => import('../features/generators/CustomGeneratorPage'));
const CampaignPage = lazy(() => import('../features/campaigns'));
const WebinarCampaign = lazy(() => import('../features/campaigns/components/WebinarCampaign'));

// Auth-Komponenten importieren (only components still used after Authentic integration)
const LoginPage = lazy(() => import('../features/auth/pages/LoginPage'));
const ProfilePage = lazy(() => import('../features/auth/pages/ProfilePage'));
const RegistrationPage = lazy(() => import('../features/auth/pages/RegistrationPage'));

// Gruppen-Komponente importieren
const JoinGroupPage = lazy(() => import('../features/groups/pages/JoinGroupPage'));

// Lazy loading für statische Seiten - platform-aware home
const HomeWrapper = lazy(() =>
  isDesktopApp()
    ? import('../components/pages/DesktopHome/DesktopHome')
    : import('../components/pages/Startseite')
);
const Datenschutz = lazy(() => import('../components/pages/Impressum_Datenschutz_Terms/Datenschutz'));
const Impressum = lazy(() => import('../components/pages/Impressum_Datenschutz_Terms/Impressum'));
const Support = lazy(() => import('../components/pages/Impressum_Datenschutz_Terms/Support'));
const Changelog = lazy(() => import('../components/pages/Impressum_Datenschutz_Terms/Changelog'));
const NotFound = lazy(() => import('../components/pages/NotFound'));
const Search = lazy(() => import('../features/search/components/SearchPage'));
const OparlPage = lazy(() => import('../features/oparl/pages/OparlPage'));
const NotebookSearchPage = lazy(() => import('../features/notebook/NotebookSearchPage'));
const NotebookPage = lazy(() => import('../features/notebook/components/NotebookPage').then(m => ({ default: m.createNotebookPage('gruene') })));
const BundestagsfraktionNotebookPage = lazy(() => import('../features/notebook/components/NotebookPage').then(m => ({ default: m.createNotebookPage('bundestagsfraktion') })));
const GrueneratorNotebookPage = lazy(() => import('../features/notebook/components/NotebookPage').then(m => ({ default: m.createNotebookPage('gruenerator') })));
const OesterreichGrueneNotebookPage = lazy(() => import('../features/notebook/components/NotebookPage').then(m => ({ default: m.createNotebookPage('oesterreich') })));
const NotebooksGalleryPage = lazy(() => import('../features/notebook/pages/NotebooksGalleryPage'));
const DocumentViewPage = lazy(() => import('../features/documents/DocumentViewPage'));
const Reel = lazy(() => import('../features/subtitler/components/SubtitlerPage'));
const SharedVideoPage = lazy(() => import('../features/subtitler/components/SharedVideoPage'));
const SharedMediaPage = lazy(() => import('../features/shared-media/SharedMediaPage'));
const PresseSocialGenerator = lazy(() => import('../features/texte/presse/PresseSocialGenerator'));
const KampagnenGenerator = lazy(() => import('../features/texte/kampagnen/KampagnenGenerator'));
const ImageStudioPage = lazy(() => import('../features/image-studio/ImageStudioPage'));
const ImageGallery = lazy(() => import('../features/image-studio/gallery'));
const AccessibilityTextGenerator = lazy(() => import('../features/texte/accessibility/AccessibilityTextGenerator'));
const AltTextGenerator = lazy(() => import('../features/texte/alttext/AltTextGenerator'));
const WebsiteGenerator = lazy(() => import('../features/website/WebsiteGenerator'));
const SurveyIndex = lazy(() => import('../features/umfragen'));
const SurveyPage = lazy(() => import('../features/umfragen').then(module => ({ default: module.SurveyPage })));
const TextEditorPage = lazy(() => import('../features/texteditor/TextEditorPage'));
const AppsPage = lazy(() => import('../features/apps/AppsPage'));
const MediaLibraryPage = lazy(() => import('../features/media-library/MediaLibraryPage').then(m => ({ default: m.default })));

// Notebook Chat Komponente importieren
const NotebookChat = lazy(() => import('../features/notebook/components/NotebookChat'));

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
    default: (props: Record<string, unknown>) => (
      wrapperModule.default({
        children: chatModule.default(props),
        featureKey: 'chat',
        fallbackPath: '/profile?tab=labor'
      })
    )
  }))
);

// Pages-Feature importieren
const DynamicPageView = lazy(() => import('../features/pages/components/DynamicPageView'));
const StructuredExamplePage = lazy(() => import('../features/pages/ExamplePage').then(module => ({ default: module.StructuredExamplePage })));
const CustomExamplePage = lazy(() => import('../features/pages/ExamplePage').then(module => ({ default: module.CustomExamplePage })));

/**
 * Lazy loading für Grüneratoren Bundle
 */
export const GrueneratorenBundle = {
  Universal: UniversalTextGenerator,
  Antrag: AntragPage,
  PresseSocial: PresseSocialGenerator,
  Kampagnen: KampagnenGenerator,
  Accessibility: AccessibilityTextGenerator,
  AltText: AltTextGenerator,
  Website: WebsiteGenerator,
  ImageStudio: ImageStudioPage,
  ImageGallery: ImageGallery,
  GrueneJugend: lazy(() => import('../components/pages/Grüneratoren/GrueneJugendGenerator')),
  Rede: UniversalTextGenerator,
  Wahlprogramm: UniversalTextGenerator,
  Search: Search,
  Oparl: OparlPage,
  Ask: NotebookSearchPage,
  GrueneNotebook: NotebookPage,
  BundestagsfraktionNotebook: BundestagsfraktionNotebookPage,
  GrueneratorNotebook: GrueneratorNotebookPage,
  OesterreichGrueneNotebook: OesterreichGrueneNotebookPage,
  NotebooksGallery: NotebooksGalleryPage,
  DocumentView: DocumentViewPage,
  AntraegeListe: GalleryPage,
  AntragDetail: AntragDetailPage,
  VorlagenListe: VorlagenGallery,
  Reel: Reel,
  Campaign: CampaignPage,
  Webinar: WebinarCampaign,
  CustomGenerator: CustomGeneratorPage,
  NotebookChat: NotebookChat,
  Chat: WrappedGrueneratorChat,
  DynamicPageView: DynamicPageView,
  StructuredExamplePage: StructuredExamplePage,
  CustomExamplePage: CustomExamplePage,
  SurveyIndex: SurveyIndex,
  SurveyPage: SurveyPage,
  TextEditor: TextEditorPage
} as const;

// Route Konfigurationen
const standardRoutes: RouteConfig[] = [
  { path: '/', component: HomeWrapper },
  { path: '/universal', component: GrueneratorenBundle.Universal, withForm: true },
  { path: '/antrag', component: GrueneratorenBundle.Antrag, withForm: true },
  { path: '/presse-social', component: GrueneratorenBundle.PresseSocial, withForm: true },
  { path: '/kampagnen', component: GrueneratorenBundle.Kampagnen, withForm: true },
  { path: '/weihnachten', component: GrueneratorenBundle.Kampagnen, withForm: true },
  { path: '/barrierefreiheit', component: GrueneratorenBundle.Accessibility, withForm: true },
  { path: '/alttext', component: GrueneratorenBundle.AltText, withForm: true },
  { path: '/website', component: GrueneratorenBundle.Website, withForm: true },
  { path: '/gruene-jugend', component: GrueneratorenBundle.GrueneJugend, withForm: true },
  { path: '/rede', component: GrueneratorenBundle.Rede, withForm: true },
  { path: '/buergerinnenanfragen', component: GrueneratorenBundle.Universal, withForm: true },
  { path: '/wahlprogramm', component: GrueneratorenBundle.Wahlprogramm, withForm: true },
  { path: '/datenbank/antraege', component: GrueneratorenBundle.AntraegeListe },
  { path: '/datenbank/antraege/:antragId', component: GrueneratorenBundle.AntragDetail },
  { path: '/datenbank/vorlagen', component: GrueneratorenBundle.VorlagenListe },
  { path: '/suche', component: GrueneratorenBundle.Search, withForm: true },
  { path: '/kommunal', component: GrueneratorenBundle.Oparl },
  { path: '/ask', component: GrueneratorenBundle.Ask, withForm: true },
  { path: '/gruene-notebook', component: GrueneratorenBundle.GrueneNotebook, withForm: true },
  { path: '/gruene-bundestag', component: GrueneratorenBundle.BundestagsfraktionNotebook, withForm: true },
  { path: '/gruenerator-notebook', component: GrueneratorenBundle.GrueneratorNotebook, withForm: true },
  { path: '/gruene-oesterreich', component: GrueneratorenBundle.OesterreichGrueneNotebook, withForm: true },
  { path: '/notebook', component: GrueneratorenBundle.NotebooksGallery },
  { path: '/notebooks', component: GrueneratorenBundle.NotebooksGallery },
  { path: '/documents/:documentId', component: GrueneratorenBundle.DocumentView },
  { path: '/reel', component: GrueneratorenBundle.Reel },
  { path: '/subtitler/share/:shareToken', component: SharedVideoPage, showHeaderFooter: false },
  { path: '/share/:shareToken', component: SharedMediaPage, showHeaderFooter: false },
  { path: '/kampagne', component: GrueneratorenBundle.Campaign },
  { path: '/webinare', component: GrueneratorenBundle.Webinar },
  { path: '/gruenerator/:slug', component: GrueneratorenBundle.CustomGenerator, withForm: true },
  { path: '/datenschutz', component: Datenschutz },
  { path: '/impressum', component: Impressum },
  { path: '/support', component: Support },
  { path: '/changelog', component: Changelog },
  // Auth-Routen (only components still used after Authentic integration)
  { path: '/login', component: LoginPage },
  { path: '/register', component: RegistrationPage },
  { path: '/profile', component: ProfilePage },
  { path: '/profile/:tab', component: ProfilePage },
  { path: '/profile/:tab/:subtab', component: ProfilePage },
  { path: '/profile/:tab/:subtab/:subsubtab', component: ProfilePage },
  // Gruppen-Route
  { path: '/join-group/:joinToken', component: JoinGroupPage },
  // Q&A Chat Routen
  { path: '/notebook/:id', component: GrueneratorenBundle.NotebookChat },
  // Grünerator Chat Route
  { path: '/chat', component: GrueneratorenBundle.Chat },
  // Survey Routes
  { path: '/umfragen', component: GrueneratorenBundle.SurveyIndex },
  // Text Editor
  { path: '/texteditor', component: GrueneratorenBundle.TextEditor },
  // Apps Download Page
  { path: '/apps', component: AppsPage },
  // Media Library Route
  { path: '/media-library', component: MediaLibraryPage },
  // Image Studio Routes
  { path: '/image-studio', component: GrueneratorenBundle.ImageStudio, withForm: true },
  { path: '/image-studio/gallery', component: GrueneratorenBundle.ImageGallery },
  { path: '/image-studio/:category', component: GrueneratorenBundle.ImageStudio, withForm: true },
  { path: '/image-studio/:category/:type', component: GrueneratorenBundle.ImageStudio, withForm: true },
  // Pages Feature Routes
  { path: '/pages/example-structured', component: GrueneratorenBundle.StructuredExamplePage },
  { path: '/pages/example-custom', component: GrueneratorenBundle.CustomExamplePage },
  { path: '/pages/:pageId', component: GrueneratorenBundle.DynamicPageView },
  { path: '*', component: NotFound }
];

const specialRoutes: RouteConfig[] = [
  // Sharepic routes removed - now handled by Image Studio at /image-studio/templates
];

/**
 * Hilfsfunktion zum Erstellen der No-Header-Footer-Variante
 */
const createNoHeaderFooterRoute = (route: RouteConfig): RouteConfig | null => {
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

export interface Routes {
  standard: RouteConfig[];
  special: RouteConfig[];
  noHeaderFooter: RouteConfig[];
}

export const routes: Routes = {
  standard: standardRoutes,
  special: specialRoutes,
  noHeaderFooter: [
    ...standardRoutes
      .map(createNoHeaderFooterRoute)
      .filter((route): route is RouteConfig => route !== null)
      .filter(route => route.path !== '/editor/collab/:documentId-no-header-footer'),
    ...specialRoutes
      .map(createNoHeaderFooterRoute)
      .filter((route): route is RouteConfig => route !== null)
  ]
};

export default routes;
