import { useAui, useAuiState } from '@assistant-ui/react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@gruenerator/shared/hooks';
import { useAgentStore, MODEL_OPTIONS } from '@gruenerator/chat';
import { useNavigation } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, useColorScheme, ScrollView } from 'react-native';
import { useShallow } from 'zustand/shallow';

import { AssistantThread } from '../../../components/chat/AssistantThread';
import { ChatDrawerHeader } from '../../../components/chat/ChatDrawerHeader';
import { ChatSettingsSheet } from '../../../components/chat/ChatSettingsSheet';
import { ComposerCard } from '../../../components/common';
import { colors, spacing, borderRadius, lightTheme, darkTheme } from '../../../theme';

import type { DrawerNavigationProp } from '@react-navigation/drawer';

const CHAT_EXAMPLES = [
  { label: 'Pressemitteilung', text: 'Schreibe eine Pressemitteilung zum Thema Klimaschutz' },
  { label: 'Instagram-Post', text: 'Schreibe einen Instagram-Post zum Thema Verkehrswende' },
  { label: 'Antrag', text: 'Erstelle einen Antrag zum Thema Bildungspolitik' },
];

const MODE_LABELS: Record<string, string> = {
  chat: 'Chat',
  notebook: 'Notebook',
  search: 'Suche',
  eigener: 'Eigener Chat',
};

const MODE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  chat: 'chatbubble-outline',
  notebook: 'book-outline',
  search: 'search-outline',
  eigener: 'settings-outline',
};

function SettingsBar({ onOpen }: { onOpen: () => void }) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const { threadMode, selectedModel, enabledTools } = useAgentStore(
    useShallow((s) => ({
      threadMode: s.threadMode,
      selectedModel: s.selectedModel,
      enabledTools: s.enabledTools,
    }))
  );

  const disabledCount = Object.values(enabledTools).filter((v) => v === false).length;
  const model = MODEL_OPTIONS.find((m) => m.id === selectedModel);

  return (
    <Pressable onPress={onOpen} style={styles.settingsBar}>
      <View style={[styles.settingsChip, { borderColor: theme.border }]}>
        <Ionicons
          name={MODE_ICONS[threadMode] || 'chatbubble-outline'}
          size={14}
          color={theme.textSecondary}
        />
        <Text style={[styles.settingsChipText, { color: theme.textSecondary }]}>
          {MODE_LABELS[threadMode] || 'Chat'}
        </Text>
      </View>

      <View style={[styles.settingsChip, { borderColor: theme.border }]}>
        <Text style={[styles.settingsChipText, { color: theme.textSecondary }]}>
          {model?.name || 'Mistral'}
        </Text>
      </View>

      {disabledCount > 0 && (
        <View style={[styles.settingsChip, { borderColor: colors.primary[400] }]}>
          <Text style={[styles.settingsChipText, { color: colors.primary[600] }]}>
            {4 - disabledCount}/4 Tools
          </Text>
        </View>
      )}

      <Ionicons name="options-outline" size={16} color={theme.textSecondary} />
    </Pressable>
  );
}

export default function ChatScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const navigation = useNavigation<DrawerNavigationProp<Record<string, object>>>();
  const { user } = useAuth();

  const aui = useAui();
  const [showThread, setShowThread] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
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
      <ChatDrawerHeader onOpenDrawer={() => navigation.openDrawer()} theme={theme} />
      {showThread ? (
        <AssistantThread theme={theme} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.overviewContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.greeting}>
            <Text style={[styles.greetingText, { color: theme.text }]}>
              {firstName ? `Hallo ${firstName},` : 'Hallo,'}
            </Text>
            <Text style={[styles.greetingSubtitle, { color: theme.textSecondary }]}>
              wie kann ich dir helfen?
            </Text>
          </View>

          <ComposerCard
            placeholder="Stelle eine Frage oder gib eine Aufgabe..."
            onSend={handleSend}
          />

          <SettingsBar onOpen={() => setSettingsVisible(true)} />

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
        </ScrollView>
      )}

      <ChatSettingsSheet
        visible={settingsVisible}
        onDismiss={() => setSettingsVisible(false)}
      />
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
    paddingHorizontal: spacing.medium,
    paddingBottom: spacing.xlarge,
  },
  greeting: {
    marginBottom: spacing.large,
  },
  greetingText: {
    fontSize: 26,
    fontWeight: '700',
  },
  greetingSubtitle: {
    fontSize: 26,
    fontWeight: '700',
    marginTop: 2,
  },
  settingsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    marginTop: spacing.medium,
  },
  settingsChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.xsmall,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  settingsChipText: {
    fontSize: 11,
    fontWeight: '500',
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
    fontSize: 12,
    fontWeight: '500',
  },
});
