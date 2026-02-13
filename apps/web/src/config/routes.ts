import { lazy, type ComponentType, type LazyExoticComponent, type FC, createElement } from 'react';
import { Navigate, useParams } from 'react-router-dom';

import { isDesktopApp } from '../utils/platform';

/**
 * Route configuration interface
 */
export interface RouteConfig {
  path: string;
  component: LazyExoticComponent<ComponentType<Record<string, unknown>>>;
  withForm?: boolean;
  showHeaderFooter?: boolean;
}

/**
 * Redirect components for deprecated routes
 */
const createRedirect = (to: string): FC<Record<string, unknown>> => {
  return () => createElement(Navigate, { to, replace: true });
};

const AltTextRedirect = lazy(() =>
  Promise.resolve({
    default: createRedirect('/barrierefreiheit?type=alt-text'),
  })
);

const LeichteSpracheRedirect = lazy(() =>
  Promise.resolve({
    default: createRedirect('/barrierefreiheit?type=leichte-sprache'),
  })
);

// Redirects for unified TexteGenerator
const PresseSocialRedirect = lazy(() =>
  Promise.resolve({
    default: createRedirect('/texte?tab=presse-social'),
  })
);

const AntragRedirect = lazy(() =>
  Promise.resolve({
    default: createRedirect('/texte?tab=antrag'),
  })
);

const UniversalRedirect = lazy(() =>
  Promise.resolve({
    default: createRedirect('/texte?tab=universal'),
  })
);

const RedeRedirect = lazy(() =>
  Promise.resolve({
    default: createRedirect('/texte?tab=universal'),
  })
);

const WahlprogrammRedirect = lazy(() =>
  Promise.resolve({
    default: createRedirect('/texte?tab=universal'),
  })
);

const BuergeranfragenRedirect = lazy(() =>
  Promise.resolve({
    default: createRedirect('/texte?tab=universal'),
  })
);

const BarrierefreiheitRedirect = lazy(() =>
  Promise.resolve({
    default: createRedirect('/texte?tab=barrierefreiheit'),
  })
);

const TextEditorRedirect = lazy(() =>
  Promise.resolve({
    default: createRedirect('/texte?tab=texteditor'),
  })
);

// Redirects for image-studio/ki routes to /imagine
const ImageStudioKiRedirect = lazy(() =>
  Promise.resolve({
    default: createRedirect('/imagine'),
  })
);

// Dynamic redirect: /image-studio/ki/:type → /imagine/:type
const ImageStudioKiTypeRedirectComponent: FC<Record<string, unknown>> = () => {
  const { type } = useParams();
  return createElement(Navigate, { to: `/imagine/${type || ''}`, replace: true });
};
const ImageStudioKiTypeRedirect = lazy(() =>
  Promise.resolve({ default: ImageStudioKiTypeRedirectComponent })
);

// Direct Imagine page (renders ImageStudio with 'ki' category pre-selected)
const ImaginePage = lazy(() => import('../features/image-studio/ImaginePage'));

// Statische Importe in dynamische umwandeln
const TexteGenerator = lazy(() => import('../features/texte/TexteGenerator'));
const GalleryPage = lazy(() => import('../components/common/Gallery'));
const VorlagenGallery = lazy(() =>
  Promise.all([
    import('../components/common/Gallery'),
    import('../components/common/BetaFeatureWrapper'),
  ]).then(([galleryMod, wrapperMod]) => ({
    default: (props: Record<string, unknown>) =>
      wrapperMod.default({
        children: galleryMod.default({
          ...props,
          initialContentType: 'vorlagen',
          availableContentTypes: ['vorlagen'],
        }),
        featureKey: 'vorlagen',
        fallbackPath: '/',
      }),
  }))
);
const AntragDetailPage = lazy(() => import('../features/templates/antraege/AntragDetailPage'));
const CustomGeneratorPage = lazy(() => import('../features/generators/CustomGeneratorPage'));
const CreateCustomGeneratorPage = lazy(
  () => import('../features/generators/CreateCustomGeneratorPage')
);
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
const Datenschutz = lazy(
  () => import('../components/pages/Impressum_Datenschutz_Terms/Datenschutz')
);
const Impressum = lazy(() => import('../components/pages/Impressum_Datenschutz_Terms/Impressum'));
const Support = lazy(() => import('../components/pages/Impressum_Datenschutz_Terms/Support'));
const NotFound = lazy(() => import('../components/pages/NotFound'));
const Search = lazy(() => import('../features/search/components/SearchPage'));
const OparlPage = lazy(() => import('../features/oparl/pages/OparlPage'));
const NotebookSearchPage = lazy(() => import('../features/notebook/NotebookSearchPage'));
const NotebookPage = lazy(() =>
  import('../features/notebook/components/NotebookPage').then((m) => ({
    default: m.createNotebookPage('gruene'),
  }))
);
const BundestagsfraktionNotebookPage = lazy(() =>
  import('../features/notebook/components/NotebookPage').then((m) => ({
    default: m.createNotebookPage('bundestagsfraktion'),
  }))
);
const GrueneratorNotebookPage = lazy(() =>
  import('../features/notebook/components/NotebookPage').then((m) => ({
    default: m.createNotebookPage('gruenerator'),
  }))
);
const OesterreichGrueneNotebookPage = lazy(() =>
  import('../features/notebook/components/NotebookPage').then((m) => ({
    default: m.createNotebookPage('oesterreich'),
  }))
);
const HamburgNotebookPage = lazy(() =>
  import('../features/notebook/components/NotebookPage').then((m) => ({
    default: m.createNotebookPage('hamburg'),
  }))
);
const SchleswigHolsteinNotebookPage = lazy(() =>
  import('../features/notebook/components/NotebookPage').then((m) => ({
    default: m.createNotebookPage('schleswigHolstein'),
  }))
);
const BayernNotebookPage = lazy(() =>
  import('../features/notebook/components/NotebookPage').then((m) => ({
    default: m.createNotebookPage('bayern'),
  }))
);
const KommunalwikiNotebookPage = lazy(() =>
  import('../features/notebook/components/NotebookPage').then((m) => ({
    default: m.createNotebookPage('kommunalwiki'),
  }))
);
const BoellStiftungNotebookPage = lazy(() =>
  import('../features/notebook/components/NotebookPage').then((m) => ({
    default: m.createNotebookPage('boellStiftung'),
  }))
);
const NotebooksGalleryPage = lazy(() => import('../features/notebook/pages/NotebooksGalleryPage'));
const DocumentViewPage = lazy(() => import('../features/documents/DocumentViewPage'));
const Reel = lazy(() => import('../features/subtitler/components/SubtitlerPage'));
const SharedVideoPage = lazy(() => import('../features/subtitler/components/SharedVideoPage'));
const SharedMediaPage = lazy(() => import('../features/shared-media/SharedMediaPage'));
const KampagnenGenerator = lazy(() => import('../features/texte/kampagnen/KampagnenGenerator'));
const ImageStudioPage = lazy(() => import('../features/image-studio/ImageStudioPage'));
const ImageGallery = lazy(() => import('../features/image-studio/gallery'));
const WebsiteGenerator = lazy(() => import('../features/website/WebsiteGenerator'));
const TextEditorPage = lazy(() => import('../features/texteditor/TextEditorPage'));
const AppsPage = lazy(() => import('../features/apps/AppsPage'));
const MediaLibraryPage = lazy(() =>
  import('../features/media-library/MediaLibraryPage').then((m) => ({ default: m.default }))
);

// Notebook Chat Komponente importieren
const NotebookChat = lazy(() => import('../features/notebook/components/NotebookChat'));

// Chat page (uses @gruenerator/chat shared package)
const WrappedChatPage = lazy(() =>
  Promise.all([
    import('../features/chat/ChatPage'),
    import('../components/common/BetaFeatureWrapper'),
  ]).then(([chatModule, wrapperModule]) => ({
    default: (props: Record<string, unknown>) =>
      wrapperModule.default({
        children: createElement(chatModule.default, props),
        featureKey: 'chat',
        fallbackPath: '/profile?tab=labor',
      }),
  }))
);

// Pages-Feature importieren
const DynamicPageView = lazy(() => import('../features/pages/components/DynamicPageView'));
const StructuredExamplePage = lazy(() =>
  import('../features/pages/ExamplePage').then((module) => ({
    default: module.StructuredExamplePage,
  }))
);
const CustomExamplePage = lazy(() =>
  import('../features/pages/ExamplePage').then((module) => ({ default: module.CustomExamplePage }))
);
const MobileEditorPage = lazy(() => import('../pages/MobileEditorPage'));
const PromptPage = lazy(() => import('../features/prompts/PromptPage'));
const PromptsGalleryPage = lazy(() => import('../features/prompts/PromptsGalleryPage'));
const DatabaseIndexPage = lazy(() => import('../features/database/pages/DatabaseIndexPage'));

const ScannerPage = lazy(() =>
  Promise.all([
    import('../features/scanner/ScannerPage'),
    import('../components/common/BetaFeatureWrapper'),
  ]).then(([scannerModule, wrapperModule]) => ({
    default: (props: Record<string, unknown>) =>
      wrapperModule.default({
        children: createElement(scannerModule.default, props),
        featureKey: 'scanner',
        fallbackPath: '/profile?tab=labor',
      }),
  }))
);
const ToolsPage = lazy(() => import('../features/tools/ToolsPage'));
const DocsListPage = lazy(() =>
  Promise.all([
    import('../features/docs/DocsListPage'),
    import('../components/common/BetaFeatureWrapper'),
  ]).then(([docsModule, wrapperModule]) => ({
    default: (props: Record<string, unknown>) =>
      wrapperModule.default({
        children: createElement(docsModule.default, props),
        featureKey: 'docs',
        fallbackPath: '/profile?tab=labor',
      }),
  }))
);
const DocsEditorPage = lazy(() =>
  Promise.all([
    import('../features/docs/DocsEditorPage'),
    import('../components/common/BetaFeatureWrapper'),
  ]).then(([docsModule, wrapperModule]) => ({
    default: (props: Record<string, unknown>) =>
      wrapperModule.default({
        children: createElement(docsModule.default, props),
        featureKey: 'docs',
        fallbackPath: '/profile?tab=labor',
      }),
  }))
);

/**
 * Lazy loading für Grüneratoren Bundle
 */
export const GrueneratorenBundle = {
  Texte: TexteGenerator,
  Kampagnen: KampagnenGenerator,
  Website: WebsiteGenerator,
  ImageStudio: ImageStudioPage,
  ImageGallery: ImageGallery,
  GrueneJugend: lazy(() => import('../components/pages/Grüneratoren/GrueneJugendGenerator')),
  Search: Search,
  Oparl: OparlPage,
  Ask: NotebookSearchPage,
  GrueneNotebook: NotebookPage,
  BundestagsfraktionNotebook: BundestagsfraktionNotebookPage,
  GrueneratorNotebook: GrueneratorNotebookPage,
  OesterreichGrueneNotebook: OesterreichGrueneNotebookPage,
  HamburgNotebook: HamburgNotebookPage,
  SchleswigHolsteinNotebook: SchleswigHolsteinNotebookPage,
  BayernNotebook: BayernNotebookPage,
  KommunalwikiNotebook: KommunalwikiNotebookPage,
  BoellStiftungNotebook: BoellStiftungNotebookPage,
  NotebooksGallery: NotebooksGalleryPage,
  DocumentView: DocumentViewPage,
  AntraegeListe: GalleryPage,
  AntragDetail: AntragDetailPage,
  VorlagenListe: VorlagenGallery,
  Reel: Reel,
  CustomGenerator: CustomGeneratorPage,
  NotebookChat: NotebookChat,
  Chat: WrappedChatPage,
  DynamicPageView: DynamicPageView,
  StructuredExamplePage: StructuredExamplePage,
  CustomExamplePage: CustomExamplePage,
  TextEditor: TextEditorPage,
  MobileEditor: MobileEditorPage,
  DatabaseIndex: DatabaseIndexPage,
  Scanner: ScannerPage,
} as const;

// Route Konfigurationen
const standardRoutes: RouteConfig[] = [
  { path: '/', component: HomeWrapper },
  // Unified Text Generator route
  { path: '/texte', component: GrueneratorenBundle.Texte, withForm: true },
  // Redirects from old routes to unified generator
  { path: '/universal', component: UniversalRedirect },
  { path: '/antrag', component: AntragRedirect },
  { path: '/presse-social', component: PresseSocialRedirect },
  { path: '/rede', component: RedeRedirect },
  { path: '/buergerinnenanfragen', component: BuergeranfragenRedirect },
  { path: '/wahlprogramm', component: WahlprogrammRedirect },
  // Other generators (not part of unified)
  { path: '/kampagnen', component: GrueneratorenBundle.Kampagnen, withForm: true },
  { path: '/weihnachten', component: GrueneratorenBundle.Kampagnen, withForm: true },
  { path: '/barrierefreiheit', component: BarrierefreiheitRedirect },
  { path: '/alttext', component: AltTextRedirect },
  { path: '/leichte-sprache', component: LeichteSpracheRedirect },
  { path: '/website', component: GrueneratorenBundle.Website, withForm: true },
  { path: '/gruene-jugend', component: GrueneratorenBundle.GrueneJugend, withForm: true },
  { path: '/tools', component: ToolsPage },
  { path: '/datenbank', component: GrueneratorenBundle.DatabaseIndex },
  { path: '/datenbank/antraege', component: GrueneratorenBundle.AntraegeListe },
  { path: '/datenbank/antraege/:antragId', component: GrueneratorenBundle.AntragDetail },
  { path: '/datenbank/vorlagen', component: GrueneratorenBundle.VorlagenListe },
  { path: '/datenbank/prompts', component: PromptsGalleryPage },
  { path: '/suche', component: GrueneratorenBundle.Search, withForm: true },
  { path: '/kommunal', component: GrueneratorenBundle.Oparl },
  { path: '/ask', component: GrueneratorenBundle.Ask, withForm: true },
  { path: '/gruene-notebook', component: GrueneratorenBundle.GrueneNotebook, withForm: true },
  {
    path: '/gruene-bundestag',
    component: GrueneratorenBundle.BundestagsfraktionNotebook,
    withForm: true,
  },
  {
    path: '/gruenerator-notebook',
    component: GrueneratorenBundle.GrueneratorNotebook,
    withForm: true,
  },
  {
    path: '/gruene-oesterreich',
    component: GrueneratorenBundle.OesterreichGrueneNotebook,
    withForm: true,
  },
  { path: '/gruene-hamburg', component: GrueneratorenBundle.HamburgNotebook, withForm: true },
  {
    path: '/gruene-schleswig-holstein',
    component: GrueneratorenBundle.SchleswigHolsteinNotebook,
    withForm: true,
  },
  { path: '/gruene-bayern', component: GrueneratorenBundle.BayernNotebook, withForm: true },
  { path: '/kommunalwiki', component: GrueneratorenBundle.KommunalwikiNotebook, withForm: true },
  { path: '/boell-stiftung', component: GrueneratorenBundle.BoellStiftungNotebook, withForm: true },
  { path: '/notebook', component: GrueneratorenBundle.NotebooksGallery },
  { path: '/notebooks', component: GrueneratorenBundle.NotebooksGallery },
  { path: '/documents/:documentId', component: GrueneratorenBundle.DocumentView },
  { path: '/reel', component: GrueneratorenBundle.Reel },
  { path: '/scanner', component: GrueneratorenBundle.Scanner },
  { path: '/subtitler/share/:shareToken', component: SharedVideoPage, showHeaderFooter: false },
  { path: '/share/:shareToken', component: SharedMediaPage, showHeaderFooter: false },
  { path: '/gruenerator/erstellen', component: CreateCustomGeneratorPage, withForm: true },
  { path: '/gruenerator/:slug', component: GrueneratorenBundle.CustomGenerator, withForm: true },
  { path: '/prompt/:slug', component: PromptPage, withForm: true },
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
  // Gruppen-Route
  { path: '/join-group/:joinToken', component: JoinGroupPage },
  // Q&A Chat Routen
  { path: '/notebook/:id', component: GrueneratorenBundle.NotebookChat },
  { path: '/chat', component: GrueneratorenBundle.Chat },
  // Text Editor - redirect to unified
  { path: '/texteditor', component: TextEditorRedirect },
  // Apps Download Page
  { path: '/apps', component: AppsPage },
  // Media Library Route
  { path: '/media-library', component: MediaLibraryPage },
  // Image Studio Routes - KI routes redirect to /imagine
  { path: '/imagine', component: ImaginePage, withForm: true },
  { path: '/imagine/:type', component: ImaginePage, withForm: true },
  { path: '/image-studio', component: ImageStudioKiRedirect },
  { path: '/image-studio/ki', component: ImageStudioKiRedirect },
  { path: '/image-studio/ki/:type', component: ImageStudioKiTypeRedirect },
  { path: '/image-studio/gallery', component: GrueneratorenBundle.ImageGallery },
  { path: '/image-studio/:category', component: GrueneratorenBundle.ImageStudio, withForm: true },
  {
    path: '/image-studio/:category/:type',
    component: GrueneratorenBundle.ImageStudio,
    withForm: true,
  },
  // Pages Feature Routes
  { path: '/pages/example-structured', component: GrueneratorenBundle.StructuredExamplePage },
  { path: '/pages/example-custom', component: GrueneratorenBundle.CustomExamplePage },
  { path: '/pages/:pageId', component: GrueneratorenBundle.DynamicPageView },
  // Docs collaborative editor
  { path: '/docs', component: DocsListPage },
  { path: '/docs/:id', component: DocsEditorPage, showHeaderFooter: false },
  { path: '*', component: NotFound },
];

const specialRoutes: RouteConfig[] = [];

/**
 * Hilfsfunktion zum Erstellen der No-Header-Footer-Variante
 */
const createNoHeaderFooterRoute = (route: RouteConfig): RouteConfig | null => {
  if (route.path === '*') return null;

  const noHeaderPath = route.path === '/' ? '/no-header-footer' : `${route.path}-no-header-footer`;

  return {
    ...route,
    path: noHeaderPath,
    showHeaderFooter: false,
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
    {
      path: '/mobile-editor',
      component: GrueneratorenBundle.MobileEditor,
      showHeaderFooter: false,
    },
    ...standardRoutes
      .map(createNoHeaderFooterRoute)
      .filter((route): route is RouteConfig => route !== null)
      .filter((route) => route.path !== '/editor/collab/:documentId-no-header-footer'),
    ...specialRoutes
      .map(createNoHeaderFooterRoute)
      .filter((route): route is RouteConfig => route !== null),
  ],
};

export default routes;
