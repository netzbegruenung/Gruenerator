import { useAui, useAuiState } from '@assistant-ui/react-native';
import { useAuth } from '@gruenerator/shared/hooks';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, useColorScheme, ScrollView } from 'react-native';

import { AssistantThread } from '../../../components/chat/AssistantThread';
import { ChatDrawerHeader } from '../../../components/chat/ChatDrawerHeader';
import { Composer, ContentColumn } from '../../../components/common';
import { useDrawerStore } from '../../../hooks/useDrawerStore';
import { spacing, borderRadius, lightTheme, darkTheme, BODY_FONT } from '../../../theme';

const CHAT_EXAMPLES = [
  { label: 'Pressemitteilung', text: 'Schreibe eine Pressemitteilung zum Thema Klimaschutz' },
  { label: 'Instagram-Post', text: 'Schreibe einen Instagram-Post zum Thema Verkehrswende' },
  { label: 'Antrag', text: 'Erstelle einen Antrag zum Thema Bildungspolitik' },
];

export default function ChatScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const openDrawer = useDrawerStore((s) => s.openDrawer);
  const { user } = useAuth();

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

  const firstName = user?.display_name?.split(' ')[0];

  const handleSend = useCallback(
    (text: string) => {
      aui.composer().setText(text);
      aui.composer().send();
      setShowThread(true);
    },
    [aui]
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ChatDrawerHeader onOpenDrawer={openDrawer} theme={theme} />
      {showThread ? (
        <AssistantThread theme={theme} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.overviewContent}
          keyboardShouldPersistTaps="handled"
        >
          <ContentColumn>
            <View style={styles.greeting}>
              <Text style={[styles.greetingText, { color: theme.text }]}>
                {firstName ? `Hallo ${firstName},` : 'Hallo,'}
              </Text>
              <Text style={[styles.greetingSubtitle, { color: theme.textSecondary }]}>
                wie kann ich dir helfen?
              </Text>
            </View>

            <Composer
              binding="runtime"
              showActionSheet
              placeholder="Stelle eine Frage oder gib eine Aufgabe..."
              onSubmit={handleSend}
            />

            <View style={styles.promptsRow}>
              {CHAT_EXAMPLES.map((p) => (
                <Pressable
                  key={p.label}
                  onPress={() => handleSend(p.text)}
                  style={({ pressed }) => [
                    styles.promptChip,
                    { borderColor: theme.border, opacity: pressed ? 0.6 : 1 },
                  ]}
                >
                  <Text style={[styles.promptLabel, { color: theme.textSecondary }]}>
                    {p.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ContentColumn>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  overviewContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: spacing.xlarge,
  },
  greeting: {
    marginBottom: spacing.large,
  },
  greetingText: {
    fontFamily: BODY_FONT,
    fontSize: 26,
    fontWeight: '700',
  },
  greetingSubtitle: {
    fontFamily: BODY_FONT,
    fontSize: 26,
    fontWeight: '700',
    marginTop: 2,
  },
  promptsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xsmall,
    marginTop: spacing.medium,
  },
  promptChip: {
    paddingHorizontal: spacing.small,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  promptLabel: {
    fontFamily: BODY_FONT,
    fontSize: 12,
    fontWeight: '500',
  },
});
