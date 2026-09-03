import { isChannelVisibleIn, type InstanceChannel } from '@gruenerator/shared/instances';
import { lazy, type ComponentType, type LazyExoticComponent, type FC, createElement } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';

import { isDesktopApp } from '../utils/platform';

import { SHOW_AGENT_CREATOR } from './featureFlags';
import { CURRENT_INSTANCE } from './instance';

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
  /** Maturity gate — omitted means `stable`. See config/instance.ts. */
  channel?: InstanceChannel;
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

// /transfer wurde entfernt (Wolke ist nur noch lesend); alte Links landen auf
// der Startseite. Verschickte Download-Links (/share/:token) sind nicht betroffen.
const TransferRedirect = lazy(() => Promise.resolve({ default: createRedirect('/') }));

// Redirect /notebook/:id → /notebooks/:id preserving the param. Search, hash
// and state come along: an old link to a notebook conversation carries the
// thread id in `?thread=`, and dropping it here opened the notebook's start
// page instead of the conversation.
export const LegacyNotebookIdRedirectComponent: FC<Record<string, unknown>> = () => {
  const { id } = useParams();
  const location = useLocation();
  return createElement(Navigate, {
    to: { pathname: `/notebooks/${id ?? ''}`, search: location.search, hash: location.hash },
    state: location.state as unknown,
    replace: true,
  });
};
const LegacyNotebookIdRedirect = lazy(() =>
  Promise.resolve({ default: LegacyNotebookIdRedirectComponent })
);

// Redirect legacy /agentura/skill/:mention → /agentura/rezept/:mention. Das
// Produkt heißt „Rezept"; „skill" stand nur noch in der URL. Der alte Pfad
// bleibt für immer — Rezeptlinks werden geteilt (URL-Sonderrecht, CLAUDE.md).
const LegacySkillMentionRedirectComponent: FC<Record<string, unknown>> = () => {
  const { mention } = useParams();
  return createElement(Navigate, { to: `/agentura/rezept/${mention ?? ''}`, replace: true });
};
const LegacySkillMentionRedirect = lazy(() =>
  Promise.resolve({ default: LegacySkillMentionRedirectComponent })
);

// Redirect legacy /gruppen/:idOrSlug → /projekte/:idOrSlug preserving the param.
const LegacyGruppenIdRedirectComponent: FC<Record<string, unknown>> = () => {
  const { idOrSlug } = useParams();
  return createElement(Navigate, { to: `/projekte/${idOrSlug ?? ''}`, replace: true });
};
const LegacyGruppenIdRedirect = lazy(() =>
  Promise.resolve({ default: LegacyGruppenIdRedirectComponent })
);

// Redirect singular /agent/:slug → canonical plural /agents/:slug
const LegacyAgentSlugRedirectComponent: FC<Record<string, unknown>> = () => {
  const { slug } = useParams();
  return createElement(Navigate, { to: `/agents/${slug ?? ''}`, replace: true });
};
const LegacyAgentSlugRedirect = lazy(() =>
  Promise.resolve({ default: LegacyAgentSlugRedirectComponent })
);
// Legacy /monitor/themen/:topic and /experiments/monitor/themen/:topic → the
// canonical /themen/:topic (preserve the topic param). The monitor pages now sit
// at the top level; both old prefixes keep redirecting for old links.
const LegacyMonitorTopicRedirectComponent: FC<Record<string, unknown>> = () => {
  const { topic } = useParams();
  return createElement(Navigate, {
    to: `/themen/${topic ?? ''}`,
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

// Legacy KI routes (/studio/ki, /imagine) now redirect to the unified Bild-Editor.
const ImageStudioKiRedirect = lazy(() =>
  Promise.resolve({
    default: createRedirect('/bild-editor'),
  })
);
const ImageStudioKiTypeRedirect = ImageStudioKiRedirect;

// Bild-Editor v2 — focused KI generate/edit/outpaint flow with version tree
const BildEditorV2Page = lazy(
  () => import('../features/image-studio/bild-editor-v2/BildEditorV2Page')
);
const ReisekostenPage = lazy(() => import('../features/reisekosten/ReisekostenPage'));

// Statische Importe in dynamische umwandeln
// Die Text-Grüneratoren sind im Chat aufgegangen, nicht in der Arbeiten-Fläche
// — alte /texte-Links landen deshalb auf dem Chat-Einstieg.
const TexteRedirectToChatComponent: FC<Record<string, unknown>> = () =>
  createElement(Navigate, { to: '/start', replace: true });
const TexteRedirectToChat = lazy(() => Promise.resolve({ default: TexteRedirectToChatComponent }));
const VorlagenGallery = lazy(() => import('../components/common/Gallery'));
const MeineVorlagenPage = lazy(() => import('../features/vorlagen/MeineVorlagenPage'));
const GeteilteVorlagePage = lazy(() => import('../features/vorlagen/GeteilteVorlagePage'));
const AdminPage = lazy(() => import('../features/admin/AdminPage'));
const AdminSkillsPage = lazy(() => import('../features/admin/AdminSkillsPage'));
const ChunkInspectorPage = lazy(() => import('../features/admin/ChunkInspectorPage'));
const LandesverbandAdminPage = lazy(
  () => import('../features/landesverband-admin/LandesverbandAdminPage')
);
const GrueneApiTestPage = lazy(() => import('../features/admin/GrueneApiTestPage'));
// Playground stillgelegt: die Seite war der zweite Ort mit freier Modellwahl und
// musste deshalb in der Datenschutzerklärung als Empfänger benannt werden. Die
// Route bleibt auskommentiert, bis entschieden ist, ob sie zurückkommt.
// const PlaygroundPage = lazy(() => import('../features/playground/PlaygroundPage'));
const IconAnimationTestPage = lazy(() => import('../features/playground/IconAnimationTestPage'));
const KugelVoiceTestPage = lazy(() => import('../features/playground/KugelVoiceTestPage'));
// Auth-Komponenten importieren (only components still used after Authentic integration)
const LoginPage = lazy(() => import('../features/auth/pages/LoginPage'));
const OAuthConsentPage = lazy(() => import('../features/auth/pages/OAuthConsentPage'));
const SettingsRedirect = lazy(() => import('../features/settings/SettingsRedirect'));
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
const MobileRenderPage = lazy(() => import('../pages/MobileRenderPage'));

const ScannerPage = lazy(() => import('../features/scanner/ScannerPage'));
const ZeichenzaehlerPage = lazy(() => import('../features/zeichenzaehler/ZeichenzaehlerPage'));
const TranskriptionPage = lazy(() => import('../features/transkription/TranskriptionPage'));
const RecurringTasksPage = lazy(() => import('../features/recurring-tasks/RecurringTasksPage'));
const WorkplacePage = lazy(() => import('../features/workplace/WorkplacePage'));
const ProjektePage = lazy(() => import('../features/groups/pages/ProjektePage'));
const OfficeSuiteLandingPage = lazy(() => import('../features/docs/OfficeSuiteLandingPage'));
// The per-type office overviews are consolidated into the /office hub; keep the
// old paths as redirects so pinned favourites and search results still resolve.
const OfficeSuiteRedirect = lazy(() => Promise.resolve({ default: createRedirect('/office') }));
const CanvasLandingPage = lazy(() => import('../features/image-studio/CanvasLandingPage'));
// Legacy /canvas landing now lives at /studio — keep /canvas as a redirect.
const CanvasToStudioRedirect = lazy(() => Promise.resolve({ default: createRedirect('/studio') }));
// Deprecated /imagine routes → unified Bild-Editor.
const ImagineRedirect = lazy(() => Promise.resolve({ default: createRedirect('/bild-editor') }));
const WissenPage = lazy(() => import('../features/notebook/WissenPage'));
// The notebook hub is now the standalone /wissen page (no longer a workplace tab).
const WissenRedirect = lazy(() => Promise.resolve({ default: createRedirect('/wissen') }));
// Arbeiten hat mit /workplace jetzt eine eigene Top-Level-URL; der alte
// Tab-Pfad bleibt als Weiterleitung bestehen.
const ArbeitenRedirect = lazy(() => Promise.resolve({ default: createRedirect('/workplace') }));
const BoardPage = lazy(() => import('../features/boards/BoardPage'));
const PublicBoardPage = lazy(() => import('../features/boards/PublicBoardPage'));
const CollabCanvasStudioPage = lazy(
  () => import('../features/image-studio/CollabCanvasStudioPage')
);
const GruenOMatDemoPage = lazy(() => import('../features/gruen-o-mat/GruenOMatDemoPage'));
const TestsommerPage = lazy(() => import('../features/testsommer/TestsommerPage'));
const MonitorThemenPage = lazy(() => import('../features/monitor/pages/MonitorThemenPage'));
const MonitorTrendsPage = lazy(() => import('../features/monitor/pages/MonitorTrendsPage'));
const MonitorUmfragenPage = lazy(() => import('../features/monitor/pages/MonitorUmfragenPage'));
const MonitorTransparenzPage = lazy(
  () => import('../features/monitor/pages/MonitorTransparenzPage')
);
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
  Texte: TexteRedirectToChat,
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
  MobileRender: MobileRenderPage,
  Scanner: ScannerPage,
  Transkription: TranskriptionPage,
} as const;

// Route Konfigurationen
const standardRoutes: RouteConfig[] = [
  // Desktop app always shows DesktopHome dashboard; web redirects auth'd users to
  // their start surface (/start or /workplace)
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
  // Wissen is now a standalone page; keep the old tab path as a redirect.
  { path: '/workplace/wissen', component: WissenRedirect },
  { path: '/wissen', component: WissenPage, layoutMode: 'sidebarOnly' },
  // Chat und Arbeiten sind zwei eigenständige Top-Level-Seiten (/start und
  // /workplace), keine Tabs unter einem gemeinsamen Präfix mehr. Beide rendern
  // dieselbe Hülle (Hintergrund + Umschaltleiste), die ihre Fläche aus dem
  // Pfad ableitet. sidebarOnly hält die Leiste an ihrem Platz.
  { path: '/start', component: WorkplacePage, layoutMode: 'sidebarOnly' },
  { path: '/workplace', component: WorkplacePage, layoutMode: 'sidebarOnly' },
  // URLs sind F0: der alte Arbeiten-Pfad leitet dauerhaft auf /workplace.
  { path: '/workplace/arbeiten', component: ArbeitenRedirect },
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
  // Agentura — the agents & recipes marketplace. Detail "product pages" sit
  // under /agentura/agent/<slug> and /agentura/rezept/<mention>; the storefront
  // is /agentura. Old library links (/agents, /skills) redirect here.
  { path: '/agentura/agent/:slug', component: AgentDetailPage },
  { path: '/agentura/rezept/:mention', component: SkillDetailPage },
  { path: '/agentura/skill/:mention', component: LegacySkillMentionRedirect },
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
  { path: '/projekte', component: ProjektePage, layoutMode: 'sidebarOnly' },
  { path: '/projekte/:idOrSlug', component: ProjektePage },
  // Legacy /gruppen* → /projekte* (Spaces/Gruppen renamed to Projekte). Keep
  // redirects so pinned favourites and shared links still resolve.
  {
    path: '/gruppen',
    component: lazy(() => Promise.resolve({ default: createRedirect('/projekte') })),
  },
  { path: '/gruppen/:idOrSlug', component: LegacyGruppenIdRedirect },
  { path: '/gruen-o-mat', component: GruenOMatDemoPage },
  // ResearchPage removed; /notebooks is the canonical entry point. Keep route as redirect for old links.
  {
    path: '/research',
    component: lazy(() => Promise.resolve({ default: createRedirect('/notebooks') })),
  },
  // Experimental features live under /experiments so the URL signals their
  // status.
  { path: '/experiments', component: ExperimentsIndexPage },
  { path: '/experiments/reisekosten', component: ReisekostenPage },
  // The former Monitor pages are standalone top-level pages — the "/monitor"
  // grouping segment is gone from the URLs and the navigation.
  { path: '/themen', component: MonitorThemenPage },
  { path: '/themen/:topic', component: MonitorThemenPage },
  { path: '/trends', component: MonitorTrendsPage },
  { path: '/umfragen', component: MonitorUmfragenPage },
  { path: '/transparenz', component: MonitorTransparenzPage },
  { path: '/watcher', component: MonitorWatcherPage },
  { path: '/feed', component: MonitorFeedPage },
  // Legacy /monitor* and /experiments/monitor* redirects (old links/bookmarks).
  {
    path: '/monitor',
    component: lazy(() => Promise.resolve({ default: createRedirect('/themen') })),
  },
  {
    path: '/monitor/themen',
    component: lazy(() => Promise.resolve({ default: createRedirect('/themen') })),
  },
  { path: '/monitor/themen/:topic', component: LegacyMonitorTopicRedirect },
  {
    path: '/monitor/umfragen',
    component: lazy(() => Promise.resolve({ default: createRedirect('/umfragen') })),
  },
  {
    path: '/monitor/watcher',
    component: lazy(() => Promise.resolve({ default: createRedirect('/watcher') })),
  },
  {
    path: '/monitor/feed',
    component: lazy(() => Promise.resolve({ default: createRedirect('/feed') })),
  },
  {
    path: '/experiments/monitor',
    component: lazy(() => Promise.resolve({ default: createRedirect('/themen') })),
  },
  {
    path: '/experiments/monitor/themen',
    component: lazy(() => Promise.resolve({ default: createRedirect('/themen') })),
  },
  { path: '/experiments/monitor/themen/:topic', component: LegacyMonitorTopicRedirect },
  {
    path: '/experiments/monitor/umfragen',
    component: lazy(() => Promise.resolve({ default: createRedirect('/umfragen') })),
  },
  {
    path: '/experiments/monitor/watcher',
    component: lazy(() => Promise.resolve({ default: createRedirect('/watcher') })),
  },
  {
    path: '/experiments/monitor/feed',
    component: lazy(() => Promise.resolve({ default: createRedirect('/feed') })),
  },
  { path: '/admin', component: AdminPage },
  { path: '/admin/skills', component: AdminSkillsPage },
  // Chunk-Inspektor (#3123). Kein layoutMode → 'default', wie /admin und
  // /admin/skills. Auth ist die Vorgabe; das Admin-Gatter sitzt in der Seite
  // (RequireAdmin) und, verbindlich, im Backend-Handler.
  { path: '/admin/chunks/:documentId', component: ChunkInspectorPage },
  // Der Instanz-Admin ist in `/admin` aufgegangen; die alte URL leitet dorthin,
  // statt zu verschwinden (URL-Sonderrecht, CLAUDE.md).
  {
    path: '/admin/bgst',
    component: lazy(() => Promise.resolve({ default: createRedirect('/admin') })),
  },
  {
    path: '/admin/landesverband/:lvId',
    component: LandesverbandAdminPage,
    layoutMode: 'sidebarOnly',
  },
  {
    path: '/admin/landesverband/:lvId/:tab',
    component: LandesverbandAdminPage,
    layoutMode: 'sidebarOnly',
  },
  { path: '/admin/gruene-api', component: GrueneApiTestPage },
  // { path: '/playground', component: PlaygroundPage },
  { path: '/icon-test', component: IconAnimationTestPage, channel: 'internal' },
  { path: '/kugel-test', component: KugelVoiceTestPage, channel: 'internal' },
  { path: '/vorlagen', component: GrueneratorenBundle.VorlagenListe },
  { path: '/vorlagen/meine', component: MeineVorlagenPage },
  // Link-shared Vorlage. `public` because the öffentlich mode has to open
  // without an account; the page itself asks for a login when the link is
  // the login-gated kind.
  { path: '/vorlagen/v/:id', component: GeteilteVorlagePage, public: true },
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
    path: '/gruene-saarland',
    component: lazy(() => Promise.resolve({ default: createRedirect('/notebooks/saarland') })),
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
  { path: '/transfer', component: TransferRedirect, channel: 'internal' },
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
    component: lazy(() => Promise.resolve({ default: createRedirect('/start') })),
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
  // noChrome so /login can be the same full-bleed hero as the start page —
  // required-mode LoginPage (shown as an overlay on other routes) is
  // unaffected, since it isn't reached via this path. Desktop keeps the
  // default layout (same as every other in-app screen): noChrome skips
  // PageLayout's isDesktop branch entirely, and DesktopTitlebar is the only
  // source of the frameless Tauri window's drag region and minimize/maximize/
  // close controls on Windows/Linux — /login is reachable from inside the
  // desktop shell itself (sidebar "Anmelden" link, dead-session redirect).
  isDesktopApp()
    ? { path: '/login', component: LoginPage, public: true }
    : { path: '/login', component: LoginPage, public: true, layoutMode: 'noChrome' as const },
  // OAuth consent for the MCP authorization server (authorize guarantees a session)
  { path: '/oauth/consent', component: OAuthConsentPage, layoutMode: 'noChrome' },
  { path: '/register', component: RegistrationPage, public: true },
  // Settings live in a global dialog; these routes only open it (deep links).
  // /profile/* are legacy aliases — old links keep resolving via the same stub.
  { path: '/settings', component: SettingsRedirect },
  { path: '/settings/:tab', component: SettingsRedirect },
  { path: '/profile', component: SettingsRedirect },
  { path: '/profile/:tab', component: SettingsRedirect },
  { path: '/profile/:tab/*', component: SettingsRedirect },
  // Gruppen-Route
  { path: '/join-group/:joinToken', component: JoinGroupPage },
  {
    // "Rollen einrichten" (chat PlusMenu) → the tab that now hosts RolesSection.
    path: '/dein-gruenerator',
    component: lazy(() =>
      Promise.resolve({ default: createRedirect('/settings/personalisierung') })
    ),
  },
  {
    path: '/chat/settings',
    component: lazy(() => Promise.resolve({ default: createRedirect('/settings') })),
  },
  // Thread deep links (Notion-style slug, suffix is the stable key) share one
  // route with bare /chat. Two entries meant RouteComponent's `key={path}`
  // changed on the /chat ↔ /chat/<slug> hop, tearing down AppProviders,
  // PageLayout, the sidebar and its thread-list portal on the very first thread
  // a user opens. React Router ranks the static /chat/settings above this
  // dynamic segment.
  {
    path: '/chat/:threadSlug?',
    component: GrueneratorenBundle.Chat,
    layoutMode: 'sidebarOnly',
  },
  { path: '/voice', component: VoiceAgentPage, layoutMode: 'noChrome' },
  // Apps & Connect Page
  { path: '/apps', component: AppsPage },
  // Media Library Route
  { path: '/media-library', component: MediaLibraryPage },
  // Legacy /image-studio/* redirects to /studio/* (dev-only — target is sharepics)
  { path: '/image-studio', component: ImageStudioRedirect, channel: 'internal' },
  { path: '/image-studio/:category', component: ImageStudioCategoryRedirect, channel: 'internal' },
  {
    path: '/image-studio/:category/:type',
    component: ImageStudioCategoryTypeRedirect,
    channel: 'internal',
  },
  // Bild-Editor is the unified KI create/edit surface; /imagine is deprecated.
  { path: '/bild-editor', component: BildEditorV2Page, layoutMode: 'sidebarOnly' },
  { path: '/imagine', component: ImagineRedirect },
  { path: '/imagine/:type', component: ImagineRedirect },
  // "/studio": the sharepic/graphics landing page. The creation wizard
  // (/studio/:category…), gallery, video and canvas editor routes stay — the
  // landing's create flow navigates into them. /canvas redirects here for
  // back-compat. Creation is a research preview gated in-UI by SHOW_SHAREPIC_STUDIO.
  { path: '/studio', component: CanvasLandingPage, layoutMode: 'sidebarOnly' },
  { path: '/canvas', component: CanvasToStudioRedirect },
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
  { path: '/office', component: OfficeSuiteLandingPage, layoutMode: 'sidebarOnly' },
  // Dispatches to the BlockNote or Univer editor by document_subtype.
  { path: '/office/:id', component: CollabDocRoute, layoutMode: 'immersive' },
  // Former type-scoped overviews now redirect to the unified /office hub. Static
  // paths precede their `:id` siblings so the redirect wins over the editor route.
  { path: '/docs', component: OfficeSuiteRedirect },
  { path: '/docs/:id', component: DocumentToOfficeRedirect },
  { path: '/sheets', component: OfficeSuiteRedirect },
  { path: '/presentations', component: OfficeSuiteRedirect },
  { path: '/boards', component: OfficeSuiteRedirect },
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

// Offscreen sharepic renderer for the app's hidden WebView. Deliberately NOT
// `public`: a rendered sharepic can reference stock images behind `requireAuth`,
// so the page needs the session the handoff cookie carries. Nobody navigates
// here by hand — the app opens it through `/api/auth/v2/web-handoff`.
standardRoutes.push({
  path: '/mobile-render',
  component: GrueneratorenBundle.MobileRender,
  layoutMode: 'noChrome',
});

// Flat list of the routes this instance serves. Auth is enforced at mount time
// by `RequireAuth`, not by bucketing routes here. A route opts out of the
// auth gate by setting `public: true`.
export const routes: RouteConfig[] = standardRoutes.filter((r) =>
  isChannelVisibleIn(r.channel, CURRENT_INSTANCE)
);

export default routes;
