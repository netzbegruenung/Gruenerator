import {
  ChatOverview,
  type NotebookLink,
  GrueneratorThread,
  useAgentStore,
  type UserRole,
} from '@gruenerator/chat';
import { getSystemAgent, resolveAgentSlug } from '@gruenerator/shared/agents';
import { useCallback, useEffect } from 'react';
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
      // Per-LV PR agents (and any future agent that declares a
      // defaultNotebookId) auto-pair their notebook so RAG and @notebook
      // lookups align with the agent's regional identity. We always re-apply
      // on agent change — the agent IS the source of truth here, and picking
      // a different notebook manually after the agent is selected is an
      // unusual flow we'd revisit only if users complain.
      const agentMeta = getSystemAgent(agentParam);
      // User-created agents aren't in the system registry — resolve their
      // notebook binding from the user-agents list (a system notebook id).
      const userAgentNotebook = agentMeta
        ? undefined
        : userAgents?.find((a) => a.identifier === agentParam)?.defaultNotebookId;
      const boundNotebookId = agentMeta?.defaultNotebookId ?? userAgentNotebook;
      if (boundNotebookId && store.selectedNotebookId !== boundNotebookId) {
        store.setSelectedNotebook(boundNotebookId);
      } else if (
        !boundNotebookId &&
        userLocale === 'de-AT' &&
        store.selectedNotebookId !== AT_DEFAULT_NOTEBOOK_ID
      ) {
        // AT-first: agents without an explicit notebook pair with the
        // Österreich notebook so RAG / @notebook queries stay in-locale.
        store.setSelectedNotebook(AT_DEFAULT_NOTEBOOK_ID);
      }
    } else if (store.selectedAgentId !== null) {
      store.setSelectedAgent(null);
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
