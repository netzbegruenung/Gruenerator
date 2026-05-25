import {
  ChatOverview,
  type NotebookLink,
  GrueneratorThread,
  useAgentStore,
  type UserRole,
} from '@gruenerator/chat';
import { getSystemAgent, resolveAgentSlug } from '@gruenerator/shared/agents';
import { useCallback, useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import withAuthRequired from '@/components/common/LoginRequired/withAuthRequired';
import { useDocumentTitle } from '@/components/hooks/useDocumentTitle';
import { useUserAgents } from '@/features/agents/api';
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
  const { slug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();
  const chatViewMode = useAgentStore((s) => s.chatViewMode);
  const currentThreadTitle = useAgentStore((s) => s.currentThreadTitle);
  const firstName = useFirstName();
  const userLocale = useAuthStore((s) => s.locale) ?? 'de-DE';
  const { data: userAgents } = useUserAgents();
  // The agent we've already auto-applied a default notebook for. Prevents the
  // effect from re-applying (and clobbering a manual notebook pick) when the
  // `userAgents` query reference changes on an unrelated cache invalidation.
  const notebookAppliedForRef = useRef<string | null>(null);
  // Path-based /agents/:slug is the canonical form; ?agent= is legacy but
  // still wins when explicitly set so old deep links keep their behavior.
  const agentParam = searchParams.get('agent') ?? (slug ? resolveAgentSlug(slug) : null);
  const modeParam = searchParams.get('mode');

  // When the URL carries an agent or mode param, jump straight into the thread —
  // otherwise users land on the overview/role-picker first and have no idea
  // their click on a sidebar agent entry "did anything".
  const effectiveViewMode =
    agentParam ||
    (modeParam && (modeParam === 'search' || modeParam === 'notebook' || modeParam === 'eigener'))
      ? 'thread'
      : chatViewMode;

  useDocumentTitle(effectiveViewMode === 'thread' ? currentThreadTitle : null);

  useEffect(() => {
    const store = useAgentStore.getState();
    if (agentParam) {
      if (store.selectedAgentId !== agentParam) {
        store.setSelectedAgent(agentParam);
        store.setChatViewMode('thread');
      }
      // Auto-pair the agent's default notebook — but only ONCE per agent, not
      // on every effect run. System agents (per-LV PR agents etc.) resolve
      // synchronously; user-created agents resolve from the user-agents list
      // (which may load late), so we wait until it's available before marking
      // this agent handled. Applying once avoids clobbering a manual notebook
      // pick when the user-agents query reference changes later.
      if (notebookAppliedForRef.current !== agentParam) {
        const agentMeta = getSystemAgent(agentParam);
        const userAgentNotebook = agentMeta
          ? undefined
          : userAgents?.find((a) => a.identifier === agentParam)?.defaultNotebookId;
        const boundNotebookId = agentMeta?.defaultNotebookId ?? userAgentNotebook;
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
    } else {
      notebookAppliedForRef.current = null;
      if (store.selectedAgentId !== null) {
        store.setSelectedAgent(null);
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
  }, [agentParam, modeParam, userLocale, userAgents]);

  const handleNavigate = useCallback((path: string) => navigate(path), [navigate]);

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

  return (
    <div className="flex min-h-0 h-full bg-background">
      <main className="flex min-h-0 flex-1 flex-col pt-4 md:pt-0">
        {effectiveViewMode === 'overview' ? (
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
    </div>
  );
}

export default withAuthRequired(ChatPage, {
  title: 'Chat',
  fallback: <div className="flex min-h-0 flex-1 bg-background" />,
});
