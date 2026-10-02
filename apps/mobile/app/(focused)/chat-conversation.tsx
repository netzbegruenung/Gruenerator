import { useAui } from '@assistant-ui/react-native';
import { findRegistryAgent, getUserAgentMentionables, useAgentStore } from '@gruenerator/chat';
import {
  getSystemAgent,
  isAgentVisibleForPlatform,
  localizeAgent,
  type Agent,
} from '@gruenerator/shared/agents';
import { useAuth } from '@gruenerator/shared/hooks';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { StyleSheet, View, useColorScheme } from 'react-native';

import { AssistantThread, type ThreadWelcome } from '../../components/chat';
import { InitialTurnSender } from '../../components/chat/InitialTurnSender';
import { MeshSurface } from '../../components/common/MeshSurface';
import { ScreenScaffold } from '../../components/navigation/ScreenScaffold';
import { usePublicUserAgents } from '../../hooks/agents/usePublicUserAgents';
import { useUserAgents } from '../../hooks/agents/useUserAgents';
import { MobileChatProvider } from '../../providers/MobileChatProvider';
import { lightTheme, darkTheme, typeScale } from '../../theme';
import { COMPOSER_GLOW, COMPOSER_GLOW_HEIGHT } from '../../theme/chatBackgrounds';
import { routeWithParams } from '../../types/routes';

const AT_DEFAULT_NOTEBOOK_ID = 'oesterreich-notebook';

// Pre-fills the composer without sending (e.g. a `/skill ` or `@tool ` mention
// dropped in from the drawer), so the user can keep typing before submitting.
function ComposerPrefiller({ text }: { text: string }) {
  const aui = useAui();

  useEffect(() => {
    if (text) {
      aui.composer.setText(text);
    }
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

type ChatConversationParams = {
  threadId: string;
  initialMessage?: string;
  /** @deprecated Notebook questions open the notebook chat; kept so older
   *  links still land there instead of in an agent chat. */
  notebookId?: string;
  agentId?: string;
  initialComposerText?: string;
};

export default function ChatConversationScreen() {
  const params = useLocalSearchParams<ChatConversationParams>();
  if (params.notebookId && !params.agentId) {
    return (
      <Redirect
        href={routeWithParams('/notebook/[id]/chat', {
          id: params.notebookId,
          ...(params.threadId && params.threadId !== 'new' && { threadId: params.threadId }),
          ...(params.initialMessage && { initialMessage: params.initialMessage }),
        })}
        withAnchor
      />
    );
  }
  return <ChatConversation {...params} />;
}

function ChatConversation({
  threadId,
  initialMessage,
  agentId,
  initialComposerText,
}: ChatConversationParams) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const { locale } = useAuth();

  // Web-only agents (e.g. the canvas-editor-backed sharepic agent) have no mobile
  // renderer — a shared deep link must not select one. Fall back to the universal
  // assistant so the chat still works.
  //
  // Derived from the route param rather than the agent store, and shared by the
  // header and the effect below: the store is written *in* that effect, so
  // reading it here would name the previous agent for one frame. And the header
  // must name the agent the chat actually runs, not the one the link asked for.
  const resolvedAgentId = useMemo(() => {
    if (!agentId) return null;
    const linked = getSystemAgent(agentId);
    return linked && !isAgentVisibleForPlatform(linked, 'mobile')
      ? 'gruenerator-universal'
      : agentId;
  }, [agentId]);

  // Only user agents need these lists; a system agent resolves from the bundled
  // registry with no request at all.
  const isSystemAgent = Boolean(resolvedAgentId && getSystemAgent(resolvedAgentId));
  const needsUserAgents = Boolean(resolvedAgentId) && !isSystemAgent;
  const { data: userAgents = [] } = useUserAgents(needsUserAgents);
  const { data: publicAgents = [] } = usePublicUserAgents(needsUserAgents);

  /**
   * Who the user is talking to, for the header and the empty state.
   *
   * Without this the screen said "Chat" and showed the generic greeting no
   * matter which Grünerator was selected — the choice was invisible the moment
   * it was made, and the agent's own opening question went unused.
   */
  const activeAgent = useMemo((): Pick<
    Agent,
    'title' | 'description' | 'welcomeQuestion' | 'openingQuestions'
  > | null => {
    if (!resolvedAgentId) return null;
    const system = getSystemAgent(resolvedAgentId);
    if (system) return localizeAgent(system, locale ?? 'de-DE');
    // User agents carry no locale variants — they are written by their owner.
    // Own first: an identifier names the caller's own agent, a colleague's
    // public one arrives as its row uuid.
    const userAgent = findRegistryAgent([...userAgents, ...publicAgents], resolvedAgentId);
    if (userAgent) return userAgent;
    // A colleague's agent shared into a project (opened by uuid from the project
    // feed) is only in the mention catalogue `useMentionablesSync` fills: it
    // names itself, but carries no opening questions.
    const shared = getUserAgentMentionables().find((m) => m.identifier === resolvedAgentId);
    return shared
      ? { title: shared.title, description: shared.description, openingQuestions: [] }
      : null;
  }, [resolvedAgentId, locale, userAgents, publicAgents]);

  const welcome: ThreadWelcome | undefined = activeAgent
    ? {
        title: activeAgent.welcomeQuestion ?? activeAgent.title,
        subtitle: activeAgent.description,
        suggestions: activeAgent.openingQuestions ?? [],
      }
    : undefined;

  // Mirror web's ChatPage: the route param is the source of truth, this screen
  // writes the global agent store (which `useMobileChatRuntime` reads to build
  // the request). When an agent is selected, auto-pair its FIRST bound notebook
  // into the composer chip the same way web does — the agent's own
  // `defaultNotebookIds[0]`, else the Österreich notebook for AT users. The
  // agent's full notebook set scopes search server-side regardless.
  useEffect(() => {
    const store = useAgentStore.getState();
    if (resolvedAgentId) {
      store.setSelectedAgent(resolvedAgentId);
      const defaultNotebookId = getSystemAgent(resolvedAgentId)?.defaultNotebookIds?.[0];
      if (defaultNotebookId) {
        store.setSelectedNotebook(defaultNotebookId);
      } else if (locale === 'de-AT') {
        store.setSelectedNotebook(AT_DEFAULT_NOTEBOOK_ID);
      }
    }
    return () => {
      const store = useAgentStore.getState();
      store.setSelectedNotebook('gruenerator-notebook');
      store.setThreadMode('chat');
    };
  }, [resolvedAgentId, locale]);

  const isNewChat = threadId === 'new';

  return (
    // The same chrome as every tab — drawer button, centred title, profile menu —
    // instead of a header of the chat's own. Vanilla, not the tab's sunrise: the
    // gold glow read as yellow behind a wall of message bubbles.
    <ScreenScaffold
      title={activeAgent?.title ?? 'Chat'}
      backdrop={
        <>
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: colorScheme === 'dark' ? theme.background : CHAT_VANILLA },
            ]}
          />
          <MeshSurface
            mesh={COMPOSER_GLOW}
            id="composer-glow"
            style={styles.composerGlow}
            followsKeyboard
            hideInDark
          />
        </>
      }
      // No "+" and no profile menu: both are a tap away in the drawer, and the
      // bar is needed for the agent's name — they run to 45 characters.
      headerRight={null}
    >
      <MobileChatProvider threadId={isNewChat ? null : threadId}>
        <AssistantThread theme={theme} welcome={welcome} transparent />
        {isNewChat && <InitialTurnSender message={initialMessage ?? ''} />}
        {isNewChat && initialComposerText && <ComposerPrefiller text={initialComposerText} />}
      </MobileChatProvider>
    </ScreenScaffold>
  );
}

/** The sunrise's cream base without its gold glow — the chat page tint. */
const CHAT_VANILLA = '#FEFCF5';

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Bottom-anchored band rather than the whole screen: the glow belongs to the
  // composer, and behind a wall of message bubbles the same colour costs
  // legibility. A `StyleSheet` entry and not an inline object — `MeshSurface` is
  // memoized, and a fresh object each render would defeat that.
  composerGlow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: typeScale(COMPOSER_GLOW_HEIGHT),
  },
});
