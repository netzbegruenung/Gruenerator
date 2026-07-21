import {
  ArtifactPanel,
  ChatOverview,
  ChatThreadRouting,
  type NotebookLink,
  GrueneratorThread,
  ReelArtifactPanel,
  SharepicArtifactPanel,
  setMentionLocale,
  useAgentStore,
  useChatRuntimeReady,
  useUserAgentsRegistry,
  type UserRole,
} from '@gruenerator/chat';
import {
  getLandesverbandHubBySlug,
  getSystemAgent,
  resolveAgentSlug,
  resolveSkillMention,
} from '@gruenerator/shared/agents';
import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import withAuthRequired from '@/components/common/LoginRequired/withAuthRequired';
import { useDocumentTitle } from '@/components/hooks/useDocumentTitle';
import { useUserAgents } from '@/features/agents/api';
import { LandesverbandHub } from '@/features/chat/LandesverbandHub';
import { SYSTEM_NOTEBOOKS } from '@/features/notebook/config/notebooksConfig';
import { useFirstName } from '@/hooks/useFirstName';
import { useAuthStore } from '@/stores/authStore';

/**
 * AT users get this notebook when their selected agent doesn't pin its own.
 * Keeps `@notebook` lookups and RAG aligned to gruene.at content instead of
 * silently retaining whichever (likely DE) notebook the user picked last.
 * DE has no equivalent single-notebook default — DE keeps its current behavior
 * (no auto-switch when the agent has no preference).
 */
const AT_DEFAULT_NOTEBOOK_ID = 'oesterreich-notebook';

const notebookLinks: NotebookLink[] = SYSTEM_NOTEBOOKS.map((nb) => ({
  id: nb.id,
  path: nb.path,
  title: nb.title.replace(/^Frag\s+/i, ''),
}));

function ChatPage() {
  const [searchParams] = useSearchParams();
  // `slug` comes from /agents/:slug, `threadSlug` from /chat/:threadSlug.
  const { slug, threadSlug } = useParams<{ slug?: string; threadSlug?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  // False while the lazy assistant-ui runtime chunk is still loading (or in the
  // Suspense fallback on a cold direct load of /chat). Gating the runtime-using
  // content below on it keeps useAssistantRuntime()/useComposerRuntime() from
  // running outside the provider — the "requires an AuiProvider" prod crash.
  const runtimeReady = useChatRuntimeReady();
  const chatViewMode = useAgentStore((s) => s.chatViewMode);
  const currentThreadTitle = useAgentStore((s) => s.currentThreadTitle);
  const firstName = useFirstName();
  const userLocale = useAuthStore((s) => s.locale) ?? 'de-DE';
  const { data: userAgents } = useUserAgents();
  // Bridge the user-agents query into the chat package so its welcome screen
  // and message avatars can resolve a user agent's title/icon by identifier.
  const setRegistryAgents = useUserAgentsRegistry((s) => s.setUserAgents);
  useEffect(() => {
    if (userAgents) setRegistryAgents(userAgents);
  }, [userAgents, setRegistryAgents]);
  // Locale-filter the @-mention / skill picker (de-DE/de-AT/all), matching the
  // agent audience rule.
  useEffect(() => {
    setMentionLocale(userLocale);
  }, [userLocale]);
  // The agent we've already auto-applied a default notebook for. Prevents the
  // effect from re-applying (and clobbering a manual notebook pick) when the
  // `userAgents` query reference changes on an unrelated cache invalidation.
  const notebookAppliedForRef = useRef<string | null>(null);
  // A Landesverband hub slug (`gruene-berlin`) opens a landing offering both LV
  // agents instead of resolving straight to one. Checked first so the slug
  // never falls through to agent resolution (which would bind a bogus agent).
  const hub = slug ? getLandesverbandHubBySlug(slug) : null;
  // Agentura skill links land on `/chat?skill=<mention>` (e.g. presse-bayern).
  // Resolve the mention to its agent identifier so the agent activates and its
  // own welcome screen (welcomeQuestion + opening-question examples) renders
  // instead of the generic overview greeting. Lowest priority in the chain so
  // an explicit ?agent= or path slug still wins.
  const skillParam = hub ? null : searchParams.get('skill');
  const resolvedFromSkill = skillParam ? resolveSkillMention(skillParam) : null;
  // Path-based /agents/:slug is the canonical form; ?agent= is legacy but
  // still wins when explicitly set so old deep links keep their behavior.
  const agentParam = hub
    ? null
    : (searchParams.get('agent') ?? (slug ? resolveAgentSlug(slug) : null) ?? resolvedFromSkill);
  const modeParam = searchParams.get('mode');

  // When the URL carries an agent/mode param or a thread deep link, jump
  // straight into the thread — otherwise users land on the overview/role-picker
  // first and have no idea their click on a sidebar agent entry "did anything".
  // For deep links this also keeps ChatOverview (which resets chat context and
  // switches to a new thread on mount) from racing the thread resolution.
  const effectiveViewMode =
    agentParam ||
    threadSlug ||
    (modeParam && (modeParam === 'search' || modeParam === 'notebook' || modeParam === 'eigener'))
      ? 'thread'
      : chatViewMode;

  useDocumentTitle(hub ? hub.name : effectiveViewMode === 'thread' ? currentThreadTitle : null);

  useEffect(() => {
    const store = useAgentStore.getState();
    if (agentParam) {
      if (store.selectedAgentId !== agentParam) {
        store.setSelectedAgent(agentParam);
        store.setChatViewMode('thread');
      }
      // Auto-pair the agent's FIRST bound notebook into the composer chip — but
      // only ONCE per agent, not on every effect run. The agent's full notebook
      // set scopes search server-side (resolved from the agent record in
      // ChatGraph); the chip just shows one for continuity. System agents (per-LV
      // PR agents etc.) resolve synchronously; user-created agents resolve from
      // the user-agents list (which may load late), so we wait until it's
      // available before marking this agent handled. Applying once avoids
      // clobbering a manual notebook pick when the query reference changes later.
      if (notebookAppliedForRef.current !== agentParam) {
        const agentMeta = getSystemAgent(agentParam);
        const userAgentNotebook = agentMeta
          ? undefined
          : userAgents?.find((a) => a.identifier === agentParam)?.defaultNotebookIds?.[0];
        const boundNotebookId = agentMeta?.defaultNotebookIds?.[0] ?? userAgentNotebook;
        // "Resolved" = a system agent (sync) or the user-agents list has loaded.
        const resolved = !!agentMeta || userAgents !== undefined;
        if (boundNotebookId) {
          if (store.selectedNotebookId !== boundNotebookId) {
            store.setSelectedNotebook(boundNotebookId);
          }
          notebookAppliedForRef.current = agentParam;
        } else if (resolved) {
          // AT-first: agents without an explicit notebook pair with the
          // Österreich notebook so RAG / @notebook queries stay in-locale.
          if (userLocale === 'de-AT' && store.selectedNotebookId !== AT_DEFAULT_NOTEBOOK_ID) {
            store.setSelectedNotebook(AT_DEFAULT_NOTEBOOK_ID);
          }
          notebookAppliedForRef.current = agentParam;
        }
        // else: user agent whose data hasn't loaded yet — wait for the next run.
      }
    } else if (!threadSlug) {
      // Not on a thread deep link: /chat without agent context is a blank
      // slate. With a threadSlug the agent is restored from the thread row
      // (ChatThreadRouting) and must not be wiped by a late userAgents re-run.
      notebookAppliedForRef.current = null;
      if (store.selectedAgentId !== null) {
        store.resetChatContext();
      }
    }
    if (
      modeParam &&
      (modeParam === 'search' || modeParam === 'notebook' || modeParam === 'eigener') &&
      store.threadMode !== modeParam
    ) {
      store.setThreadMode(modeParam);
      store.setChatViewMode('thread');
    }
  }, [agentParam, modeParam, threadSlug, userLocale, userAgents]);

  const handleNavigate = useCallback((path: string) => navigate(path), [navigate]);

  const isAgentsPath = location.pathname.startsWith('/agents/');
  const handleNavigateToThread = useCallback(
    (slugPath: string, opts: { replace: boolean }) => {
      // Canonicalizing /agents/:slug → /chat/<slug> replaces so Back leaves
      // the agent page instead of bouncing between the two URLs.
      void navigate(`/chat/${slugPath}`, { replace: opts.replace || isAgentsPath });
    },
    [navigate, isAgentsPath]
  );
  const handleThreadGone = useCallback(() => {
    void navigate('/chat', { replace: true });
  }, [navigate]);

  const handleSelectNotebook = useCallback((notebookId: string) => {
    const store = useAgentStore.getState();
    store.setThreadMode('notebook');
    store.setSelectedNotebook(notebookId);
    store.setChatViewMode('thread');
  }, []);

  const handleSelectRole = useCallback((role: UserRole) => {
    const store = useAgentStore.getState();
    if (role.systemPrompt) {
      store.setCustomSystemPrompt(role.systemPrompt);
    }
    store.setCustomRoleName(role.rolle);
    store.setThreadMode('eigener');
    store.setChatViewMode('thread');
  }, []);

  // Don't mount runtime-dependent content until the assistant-ui runtime is
  // actually present. On a cold direct load the Suspense fallback renders this
  // page without the provider; a neutral shell (matching withAuthRequired's
  // fallback) avoids the AuiProvider crash until the chunk loads.
  if (!runtimeReady) {
    return <div className="flex min-h-0 h-full bg-background" />;
  }

  return (
    <div className="flex min-h-0 h-full bg-background">
      {!hub && (
        <ChatThreadRouting
          threadSlug={threadSlug ?? null}
          onNavigateToThread={handleNavigateToThread}
          onThreadGone={handleThreadGone}
          onOpenNotebookThread={handleNavigate}
        />
      )}
      <main className="flex min-h-0 flex-1 flex-col pt-4 md:pt-0">
        {hub ? (
          <LandesverbandHub hub={hub} onNavigate={handleNavigate} userLocale={userLocale} />
        ) : effectiveViewMode === 'overview' ? (
          <ChatOverview
            firstName={firstName}
            notebooks={notebookLinks}
            onNavigate={handleNavigate}
            onSelectNotebook={handleSelectNotebook}
            onSelectRole={handleSelectRole}
            requireProfileHydration
          />
        ) : (
          <GrueneratorThread
            onNavigate={handleNavigate}
            firstName={firstName}
            requireProfileHydration
            userLocale={userLocale}
          />
        )}
      </main>
      {!hub && effectiveViewMode === 'thread' && (
        // Sharepic-Modus: pins the active sharepic as a docked artifact while
        // the user iterates via chat. Below xl the inline card stays the only
        // surface (the panel would crowd out the thread).
        <SharepicArtifactPanel className="hidden w-[24rem] shrink-0 flex-col overflow-hidden border-l border-border bg-background-alt xl:flex" />
      )}
      {!hub && effectiveViewMode === 'thread' && (
        // Reel-Modus: pins the reel video with a live subtitle overlay while
        // the user edits subtitle text via chat. Renders null unless a reel
        // is active, so it coexists with the sharepic panel.
        <ReelArtifactPanel className="hidden w-[24rem] shrink-0 flex-col overflow-hidden border-l border-border bg-background-alt xl:flex" />
      )}
      {!hub && effectiveViewMode === 'thread' && (
        // Artefakt-Modus: pins a generated HTML/SVG artifact (sandboxed iframe)
        // while the user iterates via chat. Renders null unless an artifact is
        // active; opening one closes the sharepic/reel panel (single docked rail).
        <ArtifactPanel className="hidden w-[24rem] shrink-0 flex-col overflow-hidden border-l border-border bg-background-alt xl:flex" />
      )}
    </div>
  );
}

export default withAuthRequired(ChatPage, {
  title: 'Chat',
  fallback: <div className="flex min-h-0 flex-1 bg-background" />,
});
