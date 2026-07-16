import { lazy, type ComponentType, type LazyExoticComponent, type FC, createElement } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';

import { isDesktopApp } from '../utils/platform';

import { SHOW_AGENT_CREATOR } from './featureFlags';

/**
 * Route configuration interface
 */
export type LayoutMode = 'default' | 'fullscreen' | 'immersive' | 'noChrome' | 'sidebarOnly';

export interface RouteConfig {
  path: string;
  component: LazyExoticComponent<ComponentType<Record<string, unknown>>>;
  withForm?: boolean;
  layoutMode?: LayoutMode;
  // Auth model: every route requires login by default. Set `public: true` to
  // opt out. The list of public routes is intentionally small — marketing
  // startpage, legal pages, login UI, public shares. New routes are
  // auth-required unless this flag is explicitly set.
  public?: boolean;
  devOnly?: boolean;
}

/**
 * Redirect components for deprecated routes. Preserves the current search
 * string so links like `/image-studio?template=…` survive the hop to `/studio`.
 */
const createRedirect = (to: string): FC<Record<string, unknown>> => {
  return () => {
    const { search } = useLocation();
    return createElement(Navigate, { to: { pathname: to, search }, replace: true });
  };
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

// Redirect singular /agent/:slug → canonical plural /agents/:slug
const LegacyAgentSlugRedirectComponent: FC<Record<string, unknown>> = () => {
  const { slug } = useParams();
  return createElement(Navigate, { to: `/agents/${slug ?? ''}`, replace: true });
};
const LegacyAgentSlugRedirect = lazy(() =>
  Promise.resolve({ default: LegacyAgentSlugRedirectComponent })
);
// Legacy /monitor/themen/:topic → /experiments/monitor/themen/:topic (preserve
// the topic param). Monitor moved under /experiments to signal experimental
// status in the URL; the bare /monitor* paths keep redirecting for old links.
const LegacyMonitorTopicRedirectComponent: FC<Record<string, unknown>> = () => {
  const { topic } = useParams();
  return createElement(Navigate, {
    to: `/experiments/monitor/themen/${topic ?? ''}`,
    replace: true,
  });
};
const LegacyMonitorTopicRedirect = lazy(() =>
  Promise.resolve({ default: LegacyMonitorTopicRedirectComponent })
);
// Legacy custom-generator links: /gruenerator/:slug → the converted agent's
// chat at /agents/cg-:slug (custom generators are now `cg-<slug>` user agents).
const LegacyGeneratorSlugRedirectComponent: FC<Record<string, unknown>> = () => {
  const { slug } = useParams();
  return createElement(Navigate, { to: `/agents/cg-${slug ?? ''}`, replace: true });
};
const LegacyGeneratorSlugRedirect = lazy(() =>
  Promise.resolve({ default: LegacyGeneratorSlugRedirectComponent })
);
const DocumentToOfficeRedirectComponent: FC<Record<string, unknown>> = () => {
  const { id } = useParams();
  const { search, hash } = useLocation();
  return createElement(Navigate, {
    to: { pathname: `/office/${id || ''}`, search, hash },
    replace: true,
  });
};
const DocumentToOfficeRedirect = lazy(() =>
  Promise.resolve({ default: DocumentToOfficeRedirectComponent })
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
// Bild-Editor v2 — focused KI generate/edit/outpaint flow with version tree
const BildEditorV2Page = lazy(
  () => import('../features/image-studio/bild-editor-v2/BildEditorV2Page')
);
const ReisekostenPage = lazy(() => import('../features/reisekosten/ReisekostenPage'));

// Statische Importe in dynamische umwandeln
const TexteRedirectToWorkplaceComponent: FC<Record<string, unknown>> = () =>
  createElement(Navigate, { to: '/workplace', replace: true });
const TexteRedirectToWorkplace = lazy(() =>
  Promise.resolve({ default: TexteRedirectToWorkplaceComponent })
);
const VorlagenGallery = lazy(() => import('../components/common/Gallery'));
const MeineVorlagenPage = lazy(() => import('../features/vorlagen/MeineVorlagenPage'));
const AdminDashboardPage = lazy(() => import('../features/admin/AdminDashboardPage'));
const GrueneApiTestPage = lazy(() => import('../features/admin/GrueneApiTestPage'));
const PlaygroundPage = lazy(() => import('../features/playground/PlaygroundPage'));
const IconAnimationTestPage = lazy(() => import('../features/playground/IconAnimationTestPage'));
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
const KITransparenz = lazy(
  () => import('../components/pages/Impressum_Datenschutz_Terms/KITransparenz')
);
const NotFound = lazy(() => import('../components/pages/NotFound'));
const Search = lazy(() => import('../features/search/components/SearchPage'));
const OparlPage = lazy(() => import('../features/oparl/pages/OparlPage'));
const NotebookResolverPage = lazy(() =>
  import('../features/notebook/components/NotebookResolver').then((m) => ({
    default: m.NotebookResolver,
  }))
);
const NotebookCreatePage = lazy(() =>
  import('../features/notebook/components/NotebookEditorPage').then((m) => ({
    default: m.NotebookCreatePage,
  }))
);
const NotebookEditPage = lazy(() =>
  import('../features/notebook/components/NotebookEditorPage').then((m) => ({
    default: m.NotebookEditPage,
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
const ZeichenzaehlerPage = lazy(() => import('../features/zeichenzaehler/ZeichenzaehlerPage'));
const TranskriptionPage = lazy(() => import('../features/transkription/TranskriptionPage'));
const TransferPage = lazy(() => import('../features/transfer/TransferPage'));
const RecurringTasksPage = lazy(() => import('../features/recurring-tasks/RecurringTasksPage'));
const WorkplacePage = lazy(() => import('../features/workplace/WorkplacePage'));
const GruppenPage = lazy(() => import('../features/groups/pages/GruppenPage'));
const OfficeListRedirect = lazy(() =>
  Promise.resolve({ default: createRedirect('/workplace/arbeiten') })
);
const DocsLandingPage = lazy(() =>
  import('../features/docs/OfficeLandingPage').then((m) => ({ default: m.DocsLandingPage }))
);
const BoardsLandingPage = lazy(() =>
  import('../features/docs/OfficeLandingPage').then((m) => ({ default: m.BoardsLandingPage }))
);
const SheetsLandingPage = lazy(() =>
  import('../features/docs/OfficeLandingPage').then((m) => ({ default: m.SheetsLandingPage }))
);
const PresentationsLandingPage = lazy(() =>
  import('../features/docs/OfficeLandingPage').then((m) => ({
    default: m.PresentationsLandingPage,
  }))
);
const CanvasLandingPage = lazy(() => import('../features/image-studio/CanvasLandingPage'));
const CanvasRedirect = lazy(() => Promise.resolve({ default: createRedirect('/canvas') }));
const WissenRedirect = lazy(() =>
  Promise.resolve({ default: createRedirect('/workplace/wissen') })
);
const BoardPage = lazy(() => import('../features/boards/BoardPage'));
const PublicBoardPage = lazy(() => import('../features/boards/PublicBoardPage'));
const CollabCanvasStudioPage = lazy(
  () => import('../features/image-studio/CollabCanvasStudioPage')
);
const GruenOMatDemoPage = lazy(() => import('../features/gruen-o-mat/GruenOMatDemoPage'));
const TestsommerPage = lazy(() => import('../features/testsommer/TestsommerPage'));
const MonitorUebersichtPage = lazy(() => import('../features/monitor/pages/MonitorUebersichtPage'));
const MonitorThemenPage = lazy(() => import('../features/monitor/pages/MonitorThemenPage'));
const MonitorUmfragenPage = lazy(() => import('../features/monitor/pages/MonitorUmfragenPage'));
const MonitorWatcherPage = lazy(() => import('../features/monitor/pages/MonitorWatcherPage'));
const MonitorFeedPage = lazy(() => import('../features/monitor/pages/MonitorFeedPage'));
const ExperimentsIndexPage = lazy(() => import('../features/experiments/ExperimentsIndexPage'));
const CollabDocRoute = lazy(() => import('../features/docs/CollabDocRoute'));
const SitesHomePage = lazy(() => import('../features/sites/SitesHomePage'));
const SitesLoginPage = lazy(() => import('../features/sites/SitesLoginPage'));
const SitesDemoPage = lazy(() => import('../features/sites/SitesDemoPage'));
const SitesEditPage = lazy(() => import('../features/sites/SitesEditPage'));
const AgentBuilderPage = lazy(() => import('../features/agents/AgentBuilderPage'));
const AgentCreatorPage = lazy(() => import('../features/agents/AgentCreatorPage'));
const AgentSettingsPage = lazy(() => import('../features/agents/AgentSettingsPage'));
const AgenturaPage = lazy(() => import('../features/agentura/AgenturaPage'));
const AgentDetailPage = lazy(() => import('../features/agentura/AgentDetailPage'));
const SkillDetailPage = lazy(() => import('../features/agentura/SkillDetailPage'));

/**
 * Lazy loading für Grüneratoren Bundle
 */
export const GrueneratorenBundle = {
  Texte: TexteRedirectToWorkplace,
  ImageStudio: ImageStudioPage,
  ImageGallery: ImageGallery,
  Search: Search,
  Oparl: OparlPage,
  NotebookResolver: NotebookResolverPage,
  DocumentView: DocumentViewPage,
  VorlagenListe: VorlagenGallery,
  Reel: Reel,
  Chat: ChatPage,
  MobileEditor: MobileEditorPage,
  Scanner: ScannerPage,
  Transkription: TranskriptionPage,
  Transfer: TransferPage,
} as const;

// Route Konfigurationen
const standardRoutes: RouteConfig[] = [
  // Desktop app always shows DesktopHome dashboard; web redirects auth'd users to /workplace
  isDesktopApp()
    ? { path: '/', component: DesktopHome }
    : {
        path: '/',
        component: Startseite,
        public: true,
        layoutMode: 'noChrome' as const,
      },
  { path: '/startseite', component: Startseite, public: true, layoutMode: 'noChrome' as const },
  { path: '/testsommer', component: TestsommerPage, public: true, layoutMode: 'noChrome' as const },
  // Unified Text Generator route (wildcard for path-based tab navigation)
  { path: '/texte/*', component: GrueneratorenBundle.Texte, withForm: true },
  // Workplace (Chat / Arbeiten / Wissen). ONE splat route so all three tabs
  // resolve to the same route entry: WorkplacePage then stays mounted across tab
  // switches (RouteComponent keys the page by config path) instead of remounting
  // the whole surface each time — it derives the active tab from the pathname and
  // only swaps the tab content. sidebarOnly keeps the tab row in place; Wissen's
  // h-dvh flex chain for the embedded notebook chat surface still applies.
  { path: '/workplace/*', component: WorkplacePage, layoutMode: 'sidebarOnly' },
  // Guided agent creator (default entry: AI brief → pre-filled wizard) + form
  // editor. Available to everyone via SHOW_AGENT_CREATOR; `/agents/:slug` below
  // stays available so existing agents remain usable.
  ...(SHOW_AGENT_CREATOR
    ? ([
        { path: '/agents/new', component: AgentCreatorPage },
        { path: '/agents/new/manual', component: AgentBuilderPage },
        { path: '/agents/:identifier/edit', component: AgentSettingsPage },
      ] satisfies RouteConfig[])
    : []),
  // EXPERIMENTAL — recurring agent tasks management.
  { path: '/wiederkehrend', component: RecurringTasksPage },
  // Agentura — the agents & skills marketplace. Detail "product pages" sit
  // under /agentura/agent/<slug> and /agentura/skill/<mention>; the storefront
  // is /agentura. Old library links (/agents, /skills) redirect here.
  { path: '/agentura/agent/:slug', component: AgentDetailPage },
  { path: '/agentura/skill/:mention', component: SkillDetailPage },
  { path: '/agentura', component: AgenturaPage },
  {
    path: '/agents',
    component: lazy(() => Promise.resolve({ default: createRedirect('/agentura') })),
  },
  // Chat with a specific system agent at /agents/<slug>. Slug is the agent
  // identifier with the `gruenerator-` prefix stripped (see `getAgentSlug`
  // in @gruenerator/shared/agents). ChatPage handles both this path-based
  // form and the legacy `/chat?agent=<slug>` query form.
  { path: '/agents/:slug', component: ChatPage, layoutMode: 'sidebarOnly' },
  {
    path: '/desk',
    component: lazy(() => Promise.resolve({ default: createRedirect('/workplace') })),
  },
  // Former /recherche page removed; /notebooks is the canonical entry point. Keep route as redirect for old links.
  {
    path: '/recherche',
    component: lazy(() => Promise.resolve({ default: createRedirect('/notebooks') })),
  },
  {
    path: '/skills',
    component: lazy(() => Promise.resolve({ default: createRedirect('/agentura') })),
  },
  { path: '/gruppen', component: GruppenPage },
  { path: '/gruppen/:idOrSlug', component: GruppenPage },
  { path: '/gruen-o-mat', component: GruenOMatDemoPage },
  // ResearchPage removed; /notebooks is the canonical entry point. Keep route as redirect for old links.
  {
    path: '/research',
    component: lazy(() => Promise.resolve({ default: createRedirect('/notebooks') })),
  },
  // Experimental features live under /experiments so the URL signals their
  // status. Monitor is the first — formerly the dev-only /monitor*, now
  // production-visible at /experiments/monitor*.
  { path: '/experiments', component: ExperimentsIndexPage },
  { path: '/experiments/reisekosten', component: ReisekostenPage },
  { path: '/experiments/monitor', component: MonitorUebersichtPage },
  { path: '/experiments/monitor/themen', component: MonitorThemenPage },
  { path: '/experiments/monitor/themen/:topic', component: MonitorThemenPage },
  { path: '/experiments/monitor/umfragen', component: MonitorUmfragenPage },
  { path: '/experiments/monitor/watcher', component: MonitorWatcherPage },
  { path: '/experiments/monitor/feed', component: MonitorFeedPage },
  // Legacy /monitor* redirects → /experiments/monitor* (old links/bookmarks).
  {
    path: '/monitor',
    component: lazy(() => Promise.resolve({ default: createRedirect('/experiments/monitor') })),
  },
  {
    path: '/monitor/themen',
    component: lazy(() =>
      Promise.resolve({ default: createRedirect('/experiments/monitor/themen') })
    ),
  },
  { path: '/monitor/themen/:topic', component: LegacyMonitorTopicRedirect },
  {
    path: '/monitor/umfragen',
    component: lazy(() =>
      Promise.resolve({ default: createRedirect('/experiments/monitor/umfragen') })
    ),
  },
  {
    path: '/monitor/watcher',
    component: lazy(() =>
      Promise.resolve({ default: createRedirect('/experiments/monitor/watcher') })
    ),
  },
  {
    path: '/monitor/feed',
    component: lazy(() =>
      Promise.resolve({ default: createRedirect('/experiments/monitor/feed') })
    ),
  },
  { path: '/admin', component: AdminDashboardPage },
  { path: '/admin/gruene-api', component: GrueneApiTestPage },
  { path: '/playground', component: PlaygroundPage },
  { path: '/icon-test', component: IconAnimationTestPage, devOnly: true },
  { path: '/vorlagen', component: GrueneratorenBundle.VorlagenListe },
  { path: '/vorlagen/meine', component: MeineVorlagenPage },
  {
    path: '/datenbank/vorlagen',
    component: lazy(() => Promise.resolve({ default: createRedirect('/vorlagen') })),
  },
  { path: '/suche', component: GrueneratorenBundle.Search, withForm: true },
  { path: '/kommunal', component: GrueneratorenBundle.Oparl },
  // Notebook overview now lives in the workplace "Wissen" tab; detail routes
  // below keep their canonical /notebooks/:idOrSlug URLs.
  { path: '/notebooks', component: WissenRedirect },
  // Explicit routes must come BEFORE the catch-all /notebooks/:idOrSlug so they
  // win the match — react-router resolves by listed order for path-level conflicts.
  {
    path: '/notebooks/neu',
    component: NotebookCreatePage,
    layoutMode: 'sidebarOnly',
  },
  {
    path: '/notebooks/:id/bearbeiten',
    component: NotebookEditPage,
    layoutMode: 'sidebarOnly',
  },
  // Legacy /notebooks/meine paths → fold to the new single-page surface.
  {
    path: '/notebooks/meine',
    component: lazy(() => Promise.resolve({ default: createRedirect('/notebooks') })),
  },
  {
    path: '/notebooks/meine/neu',
    component: lazy(() => Promise.resolve({ default: createRedirect('/notebooks/neu') })),
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
    path: '/gruene-sachsen-anhalt',
    component: lazy(() =>
      Promise.resolve({ default: createRedirect('/notebooks/sachsen-anhalt') })
    ),
  },
  {
    path: '/gruene-hessen',
    component: lazy(() => Promise.resolve({ default: createRedirect('/notebooks/hessen') })),
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
  { path: '/document/:id', component: DocumentToOfficeRedirect },
  { path: '/documents/:documentId', component: GrueneratorenBundle.DocumentView },
  { path: '/reel', component: GrueneratorenBundle.Reel },
  { path: '/reel/beta', component: SubtitlerBetaPage },
  { path: '/reel/studio', component: SubStudioPage },
  { path: '/scanner', component: GrueneratorenBundle.Scanner },
  { path: '/zeichenzaehler', component: ZeichenzaehlerPage },
  { path: '/transfer', component: GrueneratorenBundle.Transfer, devOnly: true },
  { path: '/transkription', component: GrueneratorenBundle.Transkription },
  {
    path: '/subtitler/share/:shareToken',
    component: SharedVideoPage,
    layoutMode: 'noChrome',
    public: true,
  },
  { path: '/share/:shareToken', component: SharedMediaPage, layoutMode: 'noChrome', public: true },
  // Custom generators are removed — prompts were auto-converted to agents.
  // Keep old links working: create page → agent creator; generator → its agent.
  {
    path: '/gruenerator/erstellen',
    component: lazy(() => Promise.resolve({ default: createRedirect('/agents/new') })),
  },
  { path: '/gruenerator/:slug', component: LegacyGeneratorSlugRedirect },
  // Redirects for removed pages
  // Legacy singular `/agent/:slug` URLs now route to the canonical plural
  // `/agents/:slug` so old bookmarks open the agent's chat instead of
  // bouncing to /workplace.
  { path: '/agent/:slug', component: LegacyAgentSlugRedirect },
  {
    path: '/prompt/:slug',
    component: lazy(() => Promise.resolve({ default: createRedirect('/workplace') })),
  },
  {
    path: '/ask',
    component: lazy(() => Promise.resolve({ default: createRedirect('/notebooks') })),
  },
  { path: '/datenschutz', component: Datenschutz, public: true },
  { path: '/impressum', component: Impressum, public: true },
  { path: '/support', component: Support, public: true },
  { path: '/nutzungsbedingungen', component: Nutzungsbedingungen, public: true },
  { path: '/ki-transparenz', component: KITransparenz, public: true },
  // Auth-Routen (only components still used after Authentic integration)
  { path: '/login', component: LoginPage, public: true },
  { path: '/register', component: RegistrationPage, public: true },
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
  // Thread deep links (Notion-style slug, suffix is the stable key). React
  // Router ranks the static /chat/settings above this dynamic segment.
  { path: '/chat/:threadSlug', component: GrueneratorenBundle.Chat, layoutMode: 'sidebarOnly' },
  { path: '/voice', component: VoiceAgentPage, layoutMode: 'noChrome' },
  // Apps & Connect Page
  { path: '/apps', component: AppsPage },
  // Media Library Route
  { path: '/media-library', component: MediaLibraryPage },
  // Legacy /image-studio/* redirects to /studio/* (dev-only — target is sharepics)
  { path: '/image-studio', component: ImageStudioRedirect, devOnly: true },
  { path: '/image-studio/:category', component: ImageStudioCategoryRedirect, devOnly: true },
  {
    path: '/image-studio/:category/:type',
    component: ImageStudioCategoryTypeRedirect,
    devOnly: true,
  },
  // Studio Routes - KI routes redirect to /imagine
  { path: '/bild-editor', component: BildEditorV2Page, layoutMode: 'sidebarOnly' },
  { path: '/imagine', component: ImaginePage, withForm: true },
  { path: '/imagine/:type', component: ImaginePage, withForm: true },
  // "/canvas": the sharepic/graphics landing page. The old /studio landing now
  // redirects here; the creation wizard (/studio/:category…), gallery, video and
  // canvas editor routes stay — the Canvas create flow navigates into them.
  // Creation is a research preview gated in-UI by SHOW_SHAREPIC_STUDIO.
  { path: '/canvas', component: CanvasLandingPage, layoutMode: 'sidebarOnly' },
  { path: '/studio', component: CanvasRedirect },
  { path: '/studio/ki', component: ImageStudioKiRedirect },
  { path: '/studio/ki/:type', component: ImageStudioKiTypeRedirect },
  { path: '/studio/video', component: GrueneratorenBundle.Reel },
  { path: '/studio/gallery', component: GrueneratorenBundle.ImageGallery },
  // Collaborative canvas — must come before /studio/:category so the literal
  // "canvas" segment matches first instead of being interpreted as a category.
  { path: '/studio/canvas/:id', component: CollabCanvasStudioPage, layoutMode: 'immersive' },
  {
    path: '/studio/:category',
    component: GrueneratorenBundle.ImageStudio,
    withForm: true,
  },
  {
    path: '/studio/:category/:type',
    component: GrueneratorenBundle.ImageStudio,
    withForm: true,
  },
  // Pages Feature Routes
  // Combined office overview still lives in the workplace "Arbeiten" tab; each
  // type also has a dedicated, type-scoped landing page below. The editors stay.
  { path: '/office', component: OfficeListRedirect },
  // Dispatches to the BlockNote or Univer editor by document_subtype.
  { path: '/office/:id', component: CollabDocRoute, layoutMode: 'immersive' },
  // Type-scoped landing pages. Static paths precede their `:id` siblings so the
  // list route wins over the editor route.
  { path: '/docs', component: DocsLandingPage, layoutMode: 'sidebarOnly' },
  { path: '/docs/:id', component: DocumentToOfficeRedirect },
  { path: '/sheets', component: SheetsLandingPage, layoutMode: 'sidebarOnly' },
  { path: '/presentations', component: PresentationsLandingPage, layoutMode: 'sidebarOnly' },
  { path: '/boards', component: BoardsLandingPage, layoutMode: 'sidebarOnly' },
  { path: '/boards/public/:id', component: PublicBoardPage, layoutMode: 'noChrome', public: true },
  { path: '/boards/:id', component: BoardPage, layoutMode: 'sidebarOnly' },
  // Sites Feature Routes — embedded candidate site builder
  { path: '/sites', component: SitesHomePage, layoutMode: 'sidebarOnly' },
  { path: '/sites/login', component: SitesLoginPage, layoutMode: 'immersive', public: true },
  { path: '/sites/demo', component: SitesDemoPage, layoutMode: 'sidebarOnly' },
  { path: '/sites/edit', component: SitesEditPage, layoutMode: 'sidebarOnly' },
  { path: '*', component: NotFound, public: true },
];

// Mobile editor is noChrome — added as standard route
standardRoutes.push({
  path: '/mobile-editor',
  component: GrueneratorenBundle.MobileEditor,
  layoutMode: 'noChrome',
});

// Flat list of all enabled routes. Auth is enforced at mount time by
// `RequireAuth`, not by bucketing routes here. A route opts out of the
// auth gate by setting `public: true`.
export const routes: RouteConfig[] = standardRoutes.filter(
  (r) => !r.devOnly || import.meta.env.DEV
);

export default routes;
