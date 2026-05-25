// React Native docs chat panel (mobile counterpart of packages/docs/src/components/chat/ChatSidebar.tsx). NOT the chat-package thread sidebar.
import { getSystemAgent, localizeAgent } from '@gruenerator/shared/agents';
import { useAuthStore } from '@gruenerator/shared/stores';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useMemo } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MobileDocsChatProvider } from '../../providers/MobileDocsChatProvider';
import { useDocsEditorBridgeStore } from '../../stores/docsEditorBridgeStore';
import { lightTheme, darkTheme, colors } from '../../theme';
import { AssistantThread, type ThreadWelcome } from '../chat/AssistantThread';

export function NativeChatSidebar({ documentId }: { documentId: string }) {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = isDark ? darkTheme : lightTheme;

  const sidebarOpen = useDocsEditorBridgeStore((s) => s.sidebarOpen);
  const toggleSidebar = useDocsEditorBridgeStore((s) => s.toggleSidebar);
  const documentTitle = useDocsEditorBridgeStore((s) => s.documentTitle);

  // Mirror web's docs-editor agent identity (icon/title/description + opening
  // questions) from the shared registry, locale-aware for de-AT users.
  const locale = useAuthStore((s) => s.user?.locale) === 'de-AT' ? 'de-AT' : 'de-DE';
  const { headerTitle, welcome } = useMemo<{
    headerTitle: string;
    welcome: ThreadWelcome | undefined;
  }>(() => {
    const raw = getSystemAgent('gruenerator-docs-editor');
    if (!raw) return { headerTitle: 'KI-Assistent', welcome: undefined };
    const agent = localizeAgent(raw, locale);
    return {
      headerTitle: agent.title,
      welcome: {
        title: agent.welcomeQuestion ?? agent.title,
        subtitle: agent.description,
        suggestions: agent.openingQuestions,
      },
    };
  }, [locale]);

  return (
    <Modal visible={sidebarOpen} animationType="slide" onRequestClose={toggleSidebar}>
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        {/* Header: agent identity + close */}
        <View
          style={[
            styles.header,
            {
              paddingTop: insets.top + 8,
              backgroundColor: theme.background,
              borderBottomColor: theme.border,
            },
          ]}
        >
          <View style={styles.headerTitleRow}>
            <Ionicons name="sparkles" size={16} color={colors.primary[600]} />
            <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
              {headerTitle}
            </Text>
          </View>
          <TouchableOpacity
            onPress={toggleSidebar}
            style={styles.closeButton}
            accessibilityLabel="Schließen"
          >
            <Ionicons name="close" size={24} color={theme.text} />
          </TouchableOpacity>
        </View>

        <MobileDocsChatProvider documentId={documentId} documentTitle={documentTitle}>
          <AssistantThread theme={theme} welcome={welcome} />
        </MobileDocsChatProvider>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    flexShrink: 1,
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
