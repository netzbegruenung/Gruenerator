import { useAui } from '@assistant-ui/react-native';
import { useAgentStore } from '@gruenerator/chat';
import { getSystemAgent } from '@gruenerator/shared/agents';
import { useAuth } from '@gruenerator/shared/hooks';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AssistantThread } from '../../components/chat';
import { ChatDrawerHeader } from '../../components/chat/ChatDrawerHeader';
import { useDrawerStore } from '../../hooks/useDrawerStore';
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
  const openDrawer = useDrawerStore((s) => s.openDrawer);

  const handleNewChat = useCallback(() => {
    router.push(routeWithParams('/(focused)/chat-conversation', { threadId: 'new' }));
  }, [router]);

  // Mirror web's ChatPage: the route param is the source of truth, this screen
  // writes the global agent store (which `useMobileChatRuntime` reads to build
  // the request). When an agent is selected, auto-pair its notebook the same
  // way web does — the agent's own `defaultNotebookId`, else the Österreich
  // notebook for AT users. An explicit `notebookId` param (notebook picker)
  // takes the simple path.
  useEffect(() => {
    const store = useAgentStore.getState();
    if (agentId) {
      store.setSelectedAgent(agentId);
      const defaultNotebookId = getSystemAgent(agentId)?.defaultNotebookId;
      if (defaultNotebookId) {
        store.setSelectedNotebook(defaultNotebookId);
      } else if (locale === 'de-AT') {
        store.setSelectedNotebook(AT_DEFAULT_NOTEBOOK_ID);
      }
    } else if (notebookId) {
      store.setSelectedNotebook(notebookId);
    }
    return () => {
      useAgentStore.getState().setSelectedNotebook('gruenerator-notebook');
    };
  }, [notebookId, agentId, locale]);

  const isNewChat = threadId === 'new';

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
      edges={['bottom']}
    >
      <MobileChatProvider threadId={isNewChat ? null : threadId}>
        <ChatDrawerHeader onOpenDrawer={openDrawer} onNewChat={handleNewChat} theme={theme} />
        <AssistantThread theme={theme} />
        {isNewChat && initialMessage && <InitialMessageSender message={initialMessage} />}
        {isNewChat && initialComposerText && <ComposerPrefiller text={initialComposerText} />}
      </MobileChatProvider>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
