import { useAgentStore } from '@gruenerator/chat/stores';
import { getSystemAgent } from '@gruenerator/shared/agents';
import { useEffect } from 'react';

const AT_DEFAULT_NOTEBOOK_ID = 'oesterreich-notebook';

/** The chat screen whose selection the agent store holds right now. */
let owner: symbol | null = null;

/**
 * Mirror web's ChatPage: the route param is the source of truth, the chat
 * screen writes the global agent store (which `useMobileChatRuntime` reads to
 * build the request). When an agent is selected, auto-pair its FIRST bound
 * notebook into the composer chip the same way web does — the agent's own
 * `defaultNotebookIds[0]`, else the Österreich notebook for AT users. The
 * agent's full notebook set scopes search server-side regardless.
 *
 * Leaving resets the store, but only while this screen still owns it: when the
 * drawer swaps one chat for another, the old screen's cleanup can run after
 * the new one wrote its selection, and comparing values cannot tell the two
 * apart when both threads use the same agent.
 */
export function useChatAgentSelection(agentId: string | null, locale: string) {
  useEffect(() => {
    const token = Symbol('chat-agent-selection');
    owner = token;
    const store = useAgentStore.getState();
    if (agentId) {
      store.setSelectedAgent(agentId);
      const defaultNotebookId = getSystemAgent(agentId)?.defaultNotebookIds?.[0];
      if (defaultNotebookId) {
        store.setSelectedNotebook(defaultNotebookId);
      } else if (locale === 'de-AT') {
        store.setSelectedNotebook(AT_DEFAULT_NOTEBOOK_ID);
      }
    }
    return () => {
      if (owner !== token) return;
      owner = null;
      const store = useAgentStore.getState();
      store.setSelectedNotebook('gruenerator-notebook');
      store.setThreadMode('chat');
      if (agentId) store.setSelectedAgent(null);
    };
  }, [agentId, locale]);
}
