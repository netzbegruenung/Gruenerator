import { useAuth } from '@gruenerator/shared/hooks';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, useColorScheme, ScrollView } from 'react-native';

import { ChatSettingsSheet } from '../../components/chat/ChatSettingsSheet';
import { ComposerCard } from '../../components/common';
import { ScreenScaffold } from '../../components/navigation/ScreenScaffold';
import { RecentlyCreatedSection } from '../../components/start/RecentlyCreatedSection';
import { ToolGrid } from '../../components/tools/ToolGrid';
import { TOOLS } from '../../components/tools/toolsConfig';
import { useToolFavoritesStore } from '../../stores/toolFavoritesStore';
import { spacing, lightTheme, darkTheme } from '../../theme';
import { routeWithParams } from '../../types/routes';

const EXAMPLE_PROMPTS = [
  { label: 'Pressemitteilung', text: 'Schreibe eine Pressemitteilung über ' },
  { label: 'Antrag', text: 'Erstelle einen Antrag zum Thema ' },
  { label: 'Instagram-Post', text: 'Schreibe einen Instagram-Post zum Thema ' },
  { label: 'Rede', text: 'Schreibe eine Rede über ' },
];

export default function StartScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const router = useRouter();
  const { user } = useAuth();
  const firstName = user?.display_name?.split(' ')[0] || 'Grüner';

  const [settingsVisible, setSettingsVisible] = useState(false);
  const favorites = useToolFavoritesStore((s) => s.favorites);
  const favoriteTools = TOOLS.filter((tool) => favorites.includes(tool.id));

  const handleSend = useCallback(
    (text: string) => {
      router.push(
        routeWithParams('/(focused)/chat-conversation', {
          threadId: 'new',
          initialMessage: text,
        })
      );
    },
    [router]
  );

  return (
    <ScreenScaffold title="Grünerator">
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.welcomeSection}>
          <Text style={[styles.welcomeText, { color: theme.text }]}>Hallo {firstName},</Text>
          <Text style={[styles.welcomeSubtitle, { color: theme.textSecondary }]}>
            wie kann ich dir helfen?
          </Text>
        </View>

        <View style={styles.inputSection}>
          <ComposerCard
            placeholder="Stelle eine Frage oder gib eine Aufgabe..."
            onSend={handleSend}
            onSettings={() => setSettingsVisible(true)}
          />
          <Text style={[styles.inputHint, { color: theme.textSecondary }]}>
            z.B. „{EXAMPLE_PROMPTS[0].label}" oder „{EXAMPLE_PROMPTS[1].label}"
          </Text>
        </View>

        <RecentlyCreatedSection theme={theme} />

        {favoriteTools.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Werkzeuge</Text>
            <ToolGrid tools={favoriteTools} />
          </View>
        )}
      </ScrollView>
      <ChatSettingsSheet visible={settingsVisible} onDismiss={() => setSettingsVisible(false)} />
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xxlarge,
  },
  welcomeSection: {
    paddingHorizontal: spacing.medium,
    paddingTop: spacing.xlarge,
    paddingBottom: spacing.small,
  },
  welcomeText: {
    fontFamily: 'Raleway_700Bold',
    fontSize: 28,
  },
  welcomeSubtitle: {
    fontFamily: 'Raleway_700Bold',
    fontSize: 28,
    marginTop: 2,
  },
  inputSection: {
    paddingHorizontal: spacing.medium,
    paddingTop: spacing.medium,
  },
  inputHint: {
    fontSize: 12,
    marginTop: spacing.xsmall,
  },
  section: {
    paddingTop: spacing.xlarge,
    paddingHorizontal: spacing.medium,
    gap: spacing.small,
  },
  sectionTitle: {
    fontFamily: 'Raleway_700Bold',
    fontSize: 16,
  },
});
