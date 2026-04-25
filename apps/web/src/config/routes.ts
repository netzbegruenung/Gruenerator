import { lazy, type ComponentType, type LazyExoticComponent, type FC, createElement } from 'react';
import { Navigate, useParams } from 'react-router-dom';

import { isDesktopApp } from '../utils/platform';

/**
 * Route configuration interface
 */
export type LayoutMode = 'default' | 'fullscreen' | 'immersive' | 'noChrome' | 'sidebarOnly';

export interface RouteConfig {
  path: string;
  component: LazyExoticComponent<ComponentType<Record<string, unknown>>>;
  withForm?: boolean;
  layoutMode?: LayoutMode;
  auth?: 'required' | 'guest';
}

/**
 * Redirect components for deprecated routes
 */
const createRedirect = (to: string): FC<Record<string, unknown>> => {
  return () => createElement(Navigate, { to, replace: true });
};

// Redirects for /image-studio/* routes to /studio/*
const ImageStudioRedirect = lazy(() => Promise.resolve({ default: createRedirect('/studio') }));

// Redirect /notebook/:id → /notebooks/:id preserving the param
const LegacyNotebookIdRedirectComponent: FC<Record<string, unknown>> = () => {
  const { id } = useParams();
  return createElement(Navigate, { to: `/notebooks/${id ?? ''}`, replace: true });
};
const LegacyNotebookIdRedirect = lazy(() =>
  Promise.resolve({ default: LegacyNotebookIdRedirectComponent })
);
const DocumentToDocsRedirectComponent: FC<Record<string, unknown>> = () => {
  const { id } = useParams();
  return createElement(Navigate, { to: `/docs/${id || ''}`, replace: true });
};
const DocumentToDocsRedirect = lazy(() =>
  Promise.resolve({ default: DocumentToDocsRedirectComponent })
);
const ImageStudioCategoryRedirectComponent: FC<Record<string, unknown>> = () => {
  const { category } = useParams();
  return createElement(Navigate, { to: `/studio/${category || ''}`, replace: true });
};
const ImageStudioCategoryRedirect = lazy(() =>
  Promise.resolve({ default: ImageStudioCategoryRedirectComponent })
);
const ImageStudioCategoryTypeRedirectComponent: FC<Record<string, unknown>> = () => {
  const { category, type } = useParams();
  return createElement(Navigate, {
    to: `/studio/${category || ''}/${type || ''}`,
    replace: true,
  });
};
const ImageStudioCategoryTypeRedirect = lazy(() =>
  Promise.resolve({ default: ImageStudioCategoryTypeRedirectComponent })
);

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
const GrueneApiTestPage = lazy(() => import('../features/admin/GrueneApiTestPage'));
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
const DesktopHome = lazy(() => import('../components/pages/DesktopHome/DesktopHome'));
const Startseite = lazy(() => import('../components/pages/Startseite'));
const Datenschutz = lazy(
  () => import('../components/pages/Impressum_Datenschutz_Terms/Datenschutz')
);
const Impressum = lazy(() => import('../components/pages/Impressum_Datenschutz_Terms/Impressum'));
const Support = lazy(() => import('../components/pages/Impressum_Datenschutz_Terms/Support'));
const Nutzungsbedingungen = lazy(
  () => import('../components/pages/Impressum_Datenschutz_Terms/Nutzungsbedingungen')
);
const NotFound = lazy(() => import('../components/pages/NotFound'));
const Search = lazy(() => import('../features/search/components/SearchPage'));
const OparlPage = lazy(() => import('../features/oparl/pages/OparlPage'));
const NotebookRootPage = lazy(() =>
  import('../features/notebook/components/NotebookRoot').then((m) => ({
    default: m.NotebookRoot,
  }))
);
const NotebookResolverPage = lazy(() =>
  import('../features/notebook/components/NotebookResolver').then((m) => ({
    default: m.NotebookResolver,
  }))
);
const DocumentViewPage = lazy(() => import('../features/documents/DocumentViewPage'));
const Reel = lazy(() => import('../features/subtitler/components/SubtitlerPage'));
const SubtitlerBetaPage = lazy(
  () => import('../features/subtitler-beta/components/SubtitlerBetaPage')
);
const SubStudioPage = lazy(() => import('../features/subtitler-beta/components/SubStudioPage'));
const SharedVideoPage = lazy(() => import('../features/subtitler/components/SharedVideoPage'));
const SharedMediaPage = lazy(() => import('../features/shared-media/SharedMediaPage'));
const ImageStudioPage = lazy(() => import('../features/image-studio/ImageStudioPage'));
const ImageGallery = lazy(() => import('../features/image-studio/gallery'));
const AppsPage = lazy(() => import('../features/apps/AppsPage'));
const MediaLibraryPage = lazy(() =>
  import('../features/media-library/MediaLibraryPage').then((m) => ({ default: m.default }))
);

// Chat page (uses @gruenerator/chat shared package)
const ChatPage = lazy(() => import('../features/chat/ChatPage'));

// Voice agent (immersive voice conversation)
const VoiceAgentPage = lazy(() => import('../features/voice-agent/VoiceAgentPage'));

const MobileEditorPage = lazy(() => import('../pages/MobileEditorPage'));

const ScannerPage = lazy(() => import('../features/scanner/ScannerPage'));
const TranskriptionPage = lazy(() => import('../features/transkription/TranskriptionPage'));
const TransferPage = lazy(() => import('../features/transfer/TransferPage'));
const BriefingPage = lazy(() => import('../features/briefing/BriefingPage'));
const BriefingArchivePage = lazy(() => import('../features/briefing/BriefingArchivePage'));
const BriefingArticlePage = lazy(() => import('../features/briefing/BriefingArticlePage'));
const DeskPage = lazy(() => import('../features/workplace/WorkplacePage'));
const RecherchePage = lazy(() => import('../features/recherche/RecherchePage'));
const GruppenPage = lazy(() => import('../features/groups/pages/GruppenPage'));
const BoardsListRedirect = lazy(() => Promise.resolve({ default: createRedirect('/docs') }));
const BoardPage = lazy(() => import('../features/boards/BoardPage'));
const PublicBoardPage = lazy(() => import('../features/boards/PublicBoardPage'));
const GruenOMatDemoPage = lazy(() => import('../features/gruen-o-mat/GruenOMatDemoPage'));
const ResearchPage = lazy(() => import('../features/research/ResearchPage'));
const MonitorPage = lazy(() => import('../features/monitor/MonitorPage'));
const DocsPage = lazy(() => import('../features/docs/DocsPage'));
const DocsEditorPage = lazy(() => import('../features/docs/DocsEditorPage'));

/**
 * Lazy loading für Grüneratoren Bundle
 */
export const GrueneratorenBundle = {
  Texte: TexteRedirectToDesk,
  ImageStudio: ImageStudioPage,
  ImageGallery: ImageGallery,
  Search: Search,
  Oparl: OparlPage,
  NotebookRoot: NotebookRootPage,
  NotebookResolver: NotebookResolverPage,
  DocumentView: DocumentViewPage,
  VorlagenListe: VorlagenGallery,
  Reel: Reel,
  CustomGenerator: CustomGeneratorPage,
  Chat: ChatPage,
  MobileEditor: MobileEditorPage,
  Scanner: ScannerPage,
  Transkription: TranskriptionPage,
  Transfer: TransferPage,
} as const;

// Route Konfigurationen
const standardRoutes: RouteConfig[] = [
  // Desktop app always shows DesktopHome dashboard; web redirects auth'd users to /desk
  isDesktopApp()
    ? { path: '/', component: DesktopHome }
    : { path: '/', component: Startseite, auth: 'guest' as const, layoutMode: 'noChrome' as const },
  { path: '/startseite', component: Startseite, auth: 'guest', layoutMode: 'noChrome' as const },
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
  { path: '/admin/gruene-api', component: GrueneApiTestPage },
  { path: '/playground', component: PlaygroundPage },
  { path: '/datenbank/vorlagen', component: GrueneratorenBundle.VorlagenListe },
  { path: '/suche', component: GrueneratorenBundle.Search, withForm: true },
  { path: '/kommunal', component: GrueneratorenBundle.Oparl },
  {
    path: '/notebooks',
    component: GrueneratorenBundle.NotebookRoot,
    withForm: true,
    layoutMode: 'sidebarOnly',
  },
  {
    path: '/notebooks/:idOrSlug',
    component: GrueneratorenBundle.NotebookResolver,
    withForm: true,
    layoutMode: 'sidebarOnly',
  },
  // Legacy notebook redirects → /notebooks/<slug>
  {
    path: '/gruene-notebook',
    component: lazy(() => Promise.resolve({ default: createRedirect('/notebooks/grundsatz') })),
  },
  {
    path: '/gruene-bundestag',
    component: lazy(() =>
      Promise.resolve({ default: createRedirect('/notebooks/bundestagsfraktion') })
    ),
  },
  {
    path: '/gruenerator-notebook',
    component: lazy(() => Promise.resolve({ default: createRedirect('/notebooks') })),
  },
  {
    path: '/gruene-oesterreich',
    component: lazy(() => Promise.resolve({ default: createRedirect('/notebooks/oesterreich') })),
  },
  {
    path: '/gruene-hamburg',
    component: lazy(() => Promise.resolve({ default: createRedirect('/notebooks/hamburg') })),
  },
  {
    path: '/gruene-schleswig-holstein',
    component: lazy(() =>
      Promise.resolve({ default: createRedirect('/notebooks/schleswig-holstein') })
    ),
  },
  {
    path: '/gruene-thueringen',
    component: lazy(() => Promise.resolve({ default: createRedirect('/notebooks/thueringen') })),
  },
  {
    path: '/gruene-bayern',
    component: lazy(() => Promise.resolve({ default: createRedirect('/notebooks/bayern') })),
  },
  {
    path: '/gruene-berlin',
    component: lazy(() => Promise.resolve({ default: createRedirect('/notebooks/berlin') })),
  },
  {
    path: '/gruene-mecklenburg-vorpommern',
    component: lazy(() =>
      Promise.resolve({ default: createRedirect('/notebooks/mecklenburg-vorpommern') })
    ),
  },
  {
    path: '/gruene-brandenburg',
    component: lazy(() => Promise.resolve({ default: createRedirect('/notebooks/brandenburg') })),
  },
  {
    path: '/kommunalwiki',
    component: lazy(() => Promise.resolve({ default: createRedirect('/notebooks/kommunalwiki') })),
  },
  {
    path: '/boell-stiftung',
    component: lazy(() =>
      Promise.resolve({ default: createRedirect('/notebooks/boell-stiftung') })
    ),
  },
  {
    path: '/gruenblog',
    component: lazy(() => Promise.resolve({ default: createRedirect('/notebooks/gruenblog') })),
  },
  {
    path: '/notebook',
    component: lazy(() => Promise.resolve({ default: createRedirect('/notebooks') })),
  },
  { path: '/notebook/:id', component: LegacyNotebookIdRedirect },
  { path: '/document/:id', component: DocumentToDocsRedirect },
  { path: '/documents/:documentId', component: GrueneratorenBundle.DocumentView },
  { path: '/reel', component: GrueneratorenBundle.Reel },
  { path: '/reel/beta', component: SubtitlerBetaPage },
  { path: '/reel/studio', component: SubStudioPage },
  { path: '/scanner', component: GrueneratorenBundle.Scanner },
  { path: '/transfer', component: GrueneratorenBundle.Transfer },
  { path: '/transkription', component: GrueneratorenBundle.Transkription },
  { path: '/subtitler/share/:shareToken', component: SharedVideoPage, layoutMode: 'noChrome' },
  { path: '/share/:shareToken', component: SharedMediaPage, layoutMode: 'noChrome' },
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
  { path: '/nutzungsbedingungen', component: Nutzungsbedingungen },
  // Auth-Routen (only components still used after Authentic integration)
  { path: '/login', component: LoginPage, auth: 'guest' },
  { path: '/register', component: RegistrationPage, auth: 'guest' },
  { path: '/profile', component: ProfilePage },
  { path: '/profile/:tab', component: ProfilePage },
  { path: '/profile/:tab/:subtab', component: ProfilePage },
  { path: '/profile/:tab/:subtab/:subsubtab', component: ProfilePage },
  // Gruppen-Route
  { path: '/join-group/:joinToken', component: JoinGroupPage },
  {
    path: '/dein-gruenerator',
    component: lazy(() => Promise.resolve({ default: createRedirect('/profile') })),
  },
  {
    path: '/chat/settings',
    component: lazy(() => Promise.resolve({ default: createRedirect('/profile') })),
  },
  { path: '/chat', component: GrueneratorenBundle.Chat, layoutMode: 'sidebarOnly' },
  { path: '/voice', component: VoiceAgentPage, layoutMode: 'noChrome' },
  // Apps & Connect Page
  { path: '/apps', component: AppsPage },
  // Media Library Route
  { path: '/media-library', component: MediaLibraryPage },
  // Legacy /image-studio/* redirects to /studio/*
  { path: '/image-studio', component: ImageStudioRedirect },
  { path: '/image-studio/:category', component: ImageStudioCategoryRedirect },
  { path: '/image-studio/:category/:type', component: ImageStudioCategoryTypeRedirect },
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
  // Docs: overview and editor
  { path: '/docs', component: DocsPage, layoutMode: 'sidebarOnly' },
  { path: '/docs/:id', component: DocsEditorPage, layoutMode: 'immersive' },
  { path: '/boards', component: BoardsListRedirect },
  { path: '/boards/public/:id', component: PublicBoardPage, layoutMode: 'noChrome' },
  { path: '/boards/:id', component: BoardPage, layoutMode: 'noChrome' },
  { path: '*', component: NotFound },
];

// Mobile editor is noChrome — added as standard route
standardRoutes.push({
  path: '/mobile-editor',
  component: GrueneratorenBundle.MobileEditor,
  layoutMode: 'noChrome',
});

const specialRoutes: RouteConfig[] = [];

export interface Routes {
  guest: RouteConfig[];
  protected: RouteConfig[];
  public: RouteConfig[];
  special: RouteConfig[];
}

export const routes: Routes = {
  guest: standardRoutes.filter((r) => r.auth === 'guest'),
  protected: standardRoutes.filter((r) => r.auth === 'required'),
  public: standardRoutes.filter((r) => !r.auth),
  special: specialRoutes,
};

export default routes;
