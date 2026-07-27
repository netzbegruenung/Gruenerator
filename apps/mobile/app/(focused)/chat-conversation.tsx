import { useAui } from '@assistant-ui/react-native';
import { useAgentStore } from '@gruenerator/chat';
import { getSystemAgent, isAgentVisibleForPlatform } from '@gruenerator/shared/agents';
import { useAuth } from '@gruenerator/shared/hooks';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { Pressable, StyleSheet, View, useColorScheme } from 'react-native';

import { AssistantThread } from '../../components/chat';
import { ScreenScaffold } from '../../components/navigation/ScreenScaffold';
import { MobileChatProvider } from '../../providers/MobileChatProvider';
import { lightTheme, darkTheme } from '../../theme';
import { routeWithParams } from '../../types/routes';

const AT_DEFAULT_NOTEBOOK_ID = 'oesterreich-notebook';

function InitialMessageSender({ message }: { message: string }) {
  const aui = useAui();

  useEffect(() => {
    if (message) {
      aui.composer().setText(message);
      aui.composer().send();
    }
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

// Pre-fills the composer without sending (e.g. a `/skill ` or `@tool ` mention
// dropped in from the drawer), so the user can keep typing before submitting.
function ComposerPrefiller({ text }: { text: string }) {
  const aui = useAui();

  useEffect(() => {
    if (text) {
      aui.composer().setText(text);
    }
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

export default function ChatConversationScreen() {
  const { threadId, initialMessage, notebookId, agentId, initialComposerText } =
    useLocalSearchParams<{
      threadId: string;
      initialMessage?: string;
      notebookId?: string;
      agentId?: string;
      initialComposerText?: string;
    }>();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const { locale } = useAuth();
  const router = useRouter();

  const handleNewChat = useCallback(() => {
    router.push(routeWithParams('/(focused)/chat-conversation', { threadId: 'new' }));
  }, [router]);

  // Mirror web's ChatPage: the route param is the source of truth, this screen
  // writes the global agent store (which `useMobileChatRuntime` reads to build
  // the request). When an agent is selected, auto-pair its FIRST bound notebook
  // into the composer chip the same way web does — the agent's own
  // `defaultNotebookIds[0]`, else the Österreich notebook for AT users. The
  // agent's full notebook set scopes search server-side regardless. An explicit
  // `notebookId` param (notebook picker) takes the simple path.
  useEffect(() => {
    const store = useAgentStore.getState();
    if (agentId) {
      // Web-only agents (e.g. the canvas-editor-backed sharepic agent) have no
      // mobile renderer — a shared deep link must not select one. Fall back to
      // the universal assistant so the chat still works.
      const linkedAgent = getSystemAgent(agentId);
      const resolvedAgentId =
        linkedAgent && !isAgentVisibleForPlatform(linkedAgent, 'mobile')
          ? 'gruenerator-universal'
          : agentId;
      store.setSelectedAgent(resolvedAgentId);
      const defaultNotebookId = getSystemAgent(resolvedAgentId)?.defaultNotebookIds?.[0];
      if (defaultNotebookId) {
        store.setSelectedNotebook(defaultNotebookId);
      } else if (locale === 'de-AT') {
        store.setSelectedNotebook(AT_DEFAULT_NOTEBOOK_ID);
      }
    } else if (notebookId) {
      // Entering from a notebook → run the specialized notebook RAG (citations +
      // sources), not the general agent chat. Switch to notebook mode so the
      // runtime hits /notebook/stream scoped to this notebook's collections.
      store.setSelectedNotebook(notebookId);
      store.setThreadMode('notebook');
    }
    return () => {
      const store = useAgentStore.getState();
      store.setSelectedNotebook('gruenerator-notebook');
      store.setThreadMode('chat');
    };
  }, [notebookId, agentId, locale]);

  const isNewChat = threadId === 'new';

  return (
    // The same chrome as every tab — drawer button, centred title, profile menu —
    // instead of a header of the chat's own. Vanilla, not the tab's sunrise: the
    // gold glow read as yellow behind a wall of message bubbles.
    <ScreenScaffold
      title="Chat"
      backdrop={
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: colorScheme === 'dark' ? theme.background : CHAT_VANILLA },
          ]}
        />
      }
      action={
        <Pressable onPress={handleNewChat} hitSlop={8} accessibilityLabel="Neue Unterhaltung">
          <Ionicons name="add-circle-outline" size={24} color={theme.text} />
        </Pressable>
      }
    >
      <MobileChatProvider threadId={isNewChat ? null : threadId}>
        <AssistantThread theme={theme} transparent />
        {isNewChat && initialMessage && <InitialMessageSender message={initialMessage} />}
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
});
