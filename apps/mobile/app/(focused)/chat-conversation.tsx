import { useAui } from '@assistant-ui/react-native';
import { useAgentStore } from '@gruenerator/chat';
import { useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AssistantThread } from '../../components/chat';
import { MobileChatProvider } from '../../providers/MobileChatProvider';
import { lightTheme, darkTheme } from '../../theme';

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

export default function ChatConversationScreen() {
  const { threadId, initialMessage, notebookId } = useLocalSearchParams<{
    threadId: string;
    initialMessage?: string;
    notebookId?: string;
  }>();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  useEffect(() => {
    if (notebookId) {
      useAgentStore.getState().setSelectedNotebook(notebookId);
    }
    return () => {
      useAgentStore.getState().setSelectedNotebook('gruenerator-notebook');
    };
  }, [notebookId]);

  const isNewChat = threadId === 'new';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <MobileChatProvider threadId={isNewChat ? null : threadId}>
        <AssistantThread theme={theme} />
        {isNewChat && initialMessage && <InitialMessageSender message={initialMessage} />}
      </MobileChatProvider>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
