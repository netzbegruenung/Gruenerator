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

// Redirects for image-studio/ki routes to /imagine
const ImageStudioKiRedirect = lazy(() =>
  Promise.resolve({
    default: createRedirect('/imagine'),
  })
);

// Dynamic redirect: /studio/ki/:type → /imagine/:type
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
const TexteRedirectToDeskComponent: FC<Record<string, unknown>> = () =>
  createElement(Navigate, { to: '/desk', replace: true });
const TexteRedirectToDesk = lazy(() => Promise.resolve({ default: TexteRedirectToDeskComponent }));
const VorlagenGallery = lazy(() => import('../components/common/Gallery'));
const AdminDashboardPage = lazy(() => import('../features/admin/AdminDashboardPage'));
const PlaygroundPage = lazy(() => import('../features/playground/PlaygroundPage'));
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
    : import('../components/pages/SmartHome')
);
const Startseite = lazy(() => import('../components/pages/Startseite'));
const Datenschutz = lazy(
  () => import('../components/pages/Impressum_Datenschutz_Terms/Datenschutz')
);
const Impressum = lazy(() => import('../components/pages/Impressum_Datenschutz_Terms/Impressum'));
const Support = lazy(() => import('../components/pages/Impressum_Datenschutz_Terms/Support'));
const NotFound = lazy(() => import('../components/pages/NotFound'));
const Search = lazy(() => import('../features/search/components/SearchPage'));
const OparlPage = lazy(() => import('../features/oparl/pages/OparlPage'));
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
const ThueringenNotebookPage = lazy(() =>
  import('../features/notebook/components/NotebookPage').then((m) => ({
    default: m.createNotebookPage('thueringen'),
  }))
);
const BayernNotebookPage = lazy(() =>
  import('../features/notebook/components/NotebookPage').then((m) => ({
    default: m.createNotebookPage('bayern'),
  }))
);
const BerlinNotebookPage = lazy(() =>
  import('../features/notebook/components/NotebookPage').then((m) => ({
    default: m.createNotebookPage('berlin'),
  }))
);
const MecklenburgVorpommernNotebookPage = lazy(() =>
  import('../features/notebook/components/NotebookPage').then((m) => ({
    default: m.createNotebookPage('mecklenburgVorpommern'),
  }))
);
const BrandenburgNotebookPage = lazy(() =>
  import('../features/notebook/components/NotebookPage').then((m) => ({
    default: m.createNotebookPage('brandenburg'),
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
const GruenblogNotebookPage = lazy(() =>
  import('../features/notebook/components/NotebookPage').then((m) => ({
    default: m.createNotebookPage('gruenblog'),
  }))
);
const DocumentViewPage = lazy(() => import('../features/documents/DocumentViewPage'));
const Reel = lazy(() => import('../features/subtitler/components/SubtitlerPage'));
const SharedVideoPage = lazy(() => import('../features/subtitler/components/SharedVideoPage'));
const SharedMediaPage = lazy(() => import('../features/shared-media/SharedMediaPage'));
const ImageStudioPage = lazy(() => import('../features/image-studio/ImageStudioPage'));
const ImageGallery = lazy(() => import('../features/image-studio/gallery'));
const AppsPage = lazy(() => import('../features/apps/AppsPage'));
const MediaLibraryPage = lazy(() =>
  import('../features/media-library/MediaLibraryPage').then((m) => ({ default: m.default }))
);

// Notebook Chat (dynamic collection by ID)
const NotebookChat = lazy(() =>
  import('../features/notebook/components/NotebookPage').then((m) => ({
    default: m.DynamicNotebook,
  }))
);

// Chat page (uses @gruenerator/chat shared package)
const ChatPage = lazy(() => import('../features/chat/ChatPage'));
const ChatSettingsPage = lazy(() => import('../features/chat/ChatSettingsPage'));

// Voice agent (immersive voice conversation)
const VoiceAgentPage = lazy(() => import('../features/voice-agent/VoiceAgentPage'));

const MobileEditorPage = lazy(() => import('../pages/MobileEditorPage'));

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
const TranskriptionPage = lazy(() =>
  Promise.all([
    import('../features/transkription/TranskriptionPage'),
    import('../components/common/BetaFeatureWrapper'),
  ]).then(([pageModule, wrapperModule]) => ({
    default: (props: Record<string, unknown>) =>
      wrapperModule.default({
        children: createElement(pageModule.default, props),
        featureKey: 'scanner',
        fallbackPath: '/profile?tab=labor',
      }),
  }))
);
const TransferPage = lazy(() => import('../features/transfer/TransferPage'));
const BriefingPage = lazy(() => import('../features/briefing/BriefingPage'));
const BriefingArchivePage = lazy(() => import('../features/briefing/BriefingArchivePage'));
const BriefingArticlePage = lazy(() => import('../features/briefing/BriefingArticlePage'));
const DeskPage = lazy(() => import('../features/workplace/WorkplacePage'));
const RecherchePage = lazy(() => import('../features/recherche/RecherchePage'));
const GruppenPage = lazy(() =>
  Promise.all([
    import('../features/groups/pages/GruppenPage'),
    import('../components/common/BetaFeatureWrapper'),
  ]).then(([gruppenModule, wrapperModule]) => ({
    default: (props: Record<string, unknown>) =>
      wrapperModule.default({
        children: createElement(gruppenModule.default, props),
        featureKey: 'groups',
        fallbackPath: '/',
      }),
  }))
);
const BoardsListRedirect = lazy(() => Promise.resolve({ default: createRedirect('/desk') }));
const BoardPage = lazy(() =>
  Promise.all([
    import('../features/boards/BoardPage'),
    import('../components/common/BetaFeatureWrapper'),
  ]).then(([boardsModule, wrapperModule]) => ({
    default: (props: Record<string, unknown>) =>
      wrapperModule.default({
        children: createElement(boardsModule.default, props),
        featureKey: 'boards',
        fallbackPath: '/profile?tab=labor',
      }),
  }))
);
const PublicBoardPage = lazy(() => import('../features/boards/PublicBoardPage'));
const GruenOMatDemoPage = lazy(() => import('../features/gruen-o-mat/GruenOMatDemoPage'));
const ResearchPage = lazy(() => import('../features/research/ResearchPage'));
const MonitorPage = lazy(() => import('../features/monitor/MonitorPage'));
const DocsListRedirect = lazy(() => Promise.resolve({ default: createRedirect('/desk') }));
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
  Texte: TexteRedirectToDesk,
  ImageStudio: ImageStudioPage,
  ImageGallery: ImageGallery,
  Search: Search,
  Oparl: OparlPage,
  GrueneNotebook: NotebookPage,
  BundestagsfraktionNotebook: BundestagsfraktionNotebookPage,
  GrueneratorNotebook: GrueneratorNotebookPage,
  OesterreichGrueneNotebook: OesterreichGrueneNotebookPage,
  HamburgNotebook: HamburgNotebookPage,
  SchleswigHolsteinNotebook: SchleswigHolsteinNotebookPage,
  ThueringenNotebook: ThueringenNotebookPage,
  BayernNotebook: BayernNotebookPage,
  BerlinNotebook: BerlinNotebookPage,
  MecklenburgVorpommernNotebook: MecklenburgVorpommernNotebookPage,
  BrandenburgNotebook: BrandenburgNotebookPage,
  KommunalwikiNotebook: KommunalwikiNotebookPage,
  BoellStiftungNotebook: BoellStiftungNotebookPage,
  GruenblogNotebook: GruenblogNotebookPage,
  DocumentView: DocumentViewPage,
  VorlagenListe: VorlagenGallery,
  Reel: Reel,
  CustomGenerator: CustomGeneratorPage,
  NotebookChat: NotebookChat,
  Chat: ChatPage,
  MobileEditor: MobileEditorPage,
  Scanner: ScannerPage,
  Transkription: TranskriptionPage,
  Transfer: TransferPage,
} as const;

// Route Konfigurationen
const standardRoutes: RouteConfig[] = [
  { path: '/', component: DeskPage },
  { path: '/startseite', component: Startseite },
  // Unified Text Generator route (wildcard for path-based tab navigation)
  { path: '/texte/*', component: GrueneratorenBundle.Texte, withForm: true },
  { path: '/desk', component: DeskPage },
  { path: '/recherche', component: RecherchePage },
  { path: '/gruppen', component: GruppenPage },
  { path: '/gruppen/:groupId', component: GruppenPage },
  { path: '/gruen-o-mat', component: GruenOMatDemoPage },
  { path: '/research', component: ResearchPage },
  { path: '/monitor', component: MonitorPage },
  { path: '/briefing', component: BriefingPage },
  { path: '/briefing/:agentId/archiv', component: BriefingArchivePage },
  { path: '/briefing/:agentId/archiv/:filename', component: BriefingArticlePage },
  { path: '/admin', component: AdminDashboardPage },
  { path: '/playground', component: PlaygroundPage },
  { path: '/datenbank/vorlagen', component: GrueneratorenBundle.VorlagenListe },
  { path: '/suche', component: GrueneratorenBundle.Search, withForm: true },
  { path: '/kommunal', component: GrueneratorenBundle.Oparl },
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
  {
    path: '/gruene-thueringen',
    component: GrueneratorenBundle.ThueringenNotebook,
    withForm: true,
  },
  { path: '/gruene-bayern', component: GrueneratorenBundle.BayernNotebook, withForm: true },
  { path: '/gruene-berlin', component: GrueneratorenBundle.BerlinNotebook, withForm: true },
  {
    path: '/gruene-mecklenburg-vorpommern',
    component: GrueneratorenBundle.MecklenburgVorpommernNotebook,
    withForm: true,
  },
  {
    path: '/gruene-brandenburg',
    component: GrueneratorenBundle.BrandenburgNotebook,
    withForm: true,
  },
  { path: '/kommunalwiki', component: GrueneratorenBundle.KommunalwikiNotebook, withForm: true },
  { path: '/boell-stiftung', component: GrueneratorenBundle.BoellStiftungNotebook, withForm: true },
  { path: '/gruenblog', component: GrueneratorenBundle.GruenblogNotebook, withForm: true },
  {
    path: '/notebook',
    component: lazy(() => Promise.resolve({ default: createRedirect('/recherche') })),
  },
  {
    path: '/notebooks',
    component: lazy(() => Promise.resolve({ default: createRedirect('/recherche') })),
  },
  { path: '/documents/:documentId', component: GrueneratorenBundle.DocumentView },
  { path: '/reel', component: GrueneratorenBundle.Reel },
  { path: '/scanner', component: GrueneratorenBundle.Scanner },
  { path: '/transfer', component: GrueneratorenBundle.Transfer },
  { path: '/transkription', component: GrueneratorenBundle.Transkription },
  { path: '/subtitler/share/:shareToken', component: SharedVideoPage, showHeaderFooter: false },
  { path: '/share/:shareToken', component: SharedMediaPage, showHeaderFooter: false },
  { path: '/gruenerator/erstellen', component: CreateCustomGeneratorPage, withForm: true },
  { path: '/gruenerator/:slug', component: GrueneratorenBundle.CustomGenerator, withForm: true },
  // Redirects for removed pages
  {
    path: '/agent/:slug',
    component: lazy(() => Promise.resolve({ default: createRedirect('/desk') })),
  },
  {
    path: '/prompt/:slug',
    component: lazy(() => Promise.resolve({ default: createRedirect('/desk') })),
  },
  {
    path: '/ask',
    component: lazy(() => Promise.resolve({ default: createRedirect('/recherche') })),
  },
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
  { path: '/chat/settings', component: ChatSettingsPage },
  { path: '/chat', component: GrueneratorenBundle.Chat },
  { path: '/voice', component: VoiceAgentPage, showHeaderFooter: false },
  // Apps & Connect Page
  { path: '/apps', component: AppsPage },
  // Media Library Route
  { path: '/media-library', component: MediaLibraryPage },
  // Studio Routes - KI routes redirect to /imagine
  { path: '/imagine', component: ImaginePage, withForm: true },
  { path: '/imagine/:type', component: ImaginePage, withForm: true },
  { path: '/studio', component: GrueneratorenBundle.ImageStudio, withForm: true },
  { path: '/studio/ki', component: ImageStudioKiRedirect },
  { path: '/studio/ki/:type', component: ImageStudioKiTypeRedirect },
  { path: '/studio/video', component: GrueneratorenBundle.Reel },
  { path: '/studio/gallery', component: GrueneratorenBundle.ImageGallery },
  { path: '/studio/:category', component: GrueneratorenBundle.ImageStudio, withForm: true },
  {
    path: '/studio/:category/:type',
    component: GrueneratorenBundle.ImageStudio,
    withForm: true,
  },
  // Pages Feature Routes
  // Docs collaborative editor
  { path: '/docs', component: DocsListRedirect },
  { path: '/docs/:id', component: DocsEditorPage, showHeaderFooter: false },
  { path: '/boards', component: BoardsListRedirect },
  { path: '/boards/public/:id', component: PublicBoardPage, showHeaderFooter: false },
  { path: '/boards/:id', component: BoardPage, showHeaderFooter: false },
  { path: '*', component: NotFound },
];

const specialRoutes: RouteConfig[] = [];

/**
 * Hilfsfunktion zum Erstellen der No-Header-Footer-Variante
 */
const createNoHeaderFooterRoute = (route: RouteConfig): RouteConfig | null => {
  if (route.path === '*') return null;

  let noHeaderPath: string;
  if (route.path === '/') {
    noHeaderPath = '/no-header-footer';
  } else if (route.path.endsWith('/*')) {
    // /texte/* → /texte-no-header-footer/*
    noHeaderPath = `${route.path.slice(0, -2)}-no-header-footer/*`;
  } else {
    noHeaderPath = `${route.path}-no-header-footer`;
  }

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
