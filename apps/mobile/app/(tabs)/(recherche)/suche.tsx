import {
  AssistantRuntimeProvider,
  ThreadPrimitive,
  useAui,
  useAuiState,
} from '@assistant-ui/react-native';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, useColorScheme } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AssistantComposer } from '../../../components/chat/AssistantComposer';
import { MessageBubble } from '../../../components/chat/MessageBubble';
import { OverviewLanding } from '../../../components/common';
import { useSearchRuntime } from '../../../hooks/useSearchRuntime';
import { lightTheme, darkTheme } from '../../../theme';

const SEARCH_EXAMPLES = [
  { label: 'Verkehrswende', text: 'Verkehrswende in Kommunen Beispiele' },
  { label: 'Klimaschutz', text: 'Klimaschutz für Kommunen Ideen' },
  { label: 'Energiewende', text: 'Aktuelle Entwicklungen Energiewende' },
];

function SearchThread() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const insets = useSafeAreaInsets();
  const messageComponents = useMemo(() => ({ Message: MessageBubble }), []);

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.flex}>
      <ThreadPrimitive.Root style={[styles.flex, { backgroundColor: theme.background }]}>
        <ThreadPrimitive.Messages
          components={messageComponents}
          contentContainerStyle={styles.messagesContent}
          keyboardDismissMode="interactive"
        />
        <AssistantComposer theme={theme} bottomInset={insets.bottom} />
      </ThreadPrimitive.Root>
    </KeyboardAvoidingView>
  );
}

function SearchContent() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const aui = useAui();
  const [showThread, setShowThread] = useState(false);
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const hasSwitched = useRef(false);

  useEffect(() => {
    if (isRunning && !hasSwitched.current) {
      hasSwitched.current = true;
      setShowThread(true);
    }
    if (!isRunning) {
      hasSwitched.current = false;
    }
  }, [isRunning]);

  const handleSend = useCallback(
    (text: string) => {
      aui.composer().setText(text);
      aui.composer().send();
      setShowThread(true);
    },
    [aui]
  );

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      {showThread ? (
        <SearchThread />
      ) : (
        <OverviewLanding
          title="Suche"
          placeholder="Recherchieren..."
          examples={SEARCH_EXAMPLES}
          onSend={handleSend}
        />
      )}
    </View>
  );
}

export default function SucheScreen() {
  const runtime = useSearchRuntime('web');

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <SearchContent />
    </AssistantRuntimeProvider>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  messagesContent: {
    paddingTop: 8,
  },
});
