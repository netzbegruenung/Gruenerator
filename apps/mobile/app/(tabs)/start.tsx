import { useAuth } from '@gruenerator/shared/hooks';
import { getGreeting } from '@gruenerator/shared/utils';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, useColorScheme, ScrollView } from 'react-native';

import { ChatSettingsSheet } from '../../components/chat/ChatSettingsSheet';
import { BottomComposerBar } from '../../components/common/BottomComposerBar';
import { SunriseBackground } from '../../components/common/SunriseBackground';
import { ScreenScaffold } from '../../components/navigation/ScreenScaffold';
import { RecentlyCreatedSection } from '../../components/start/RecentlyCreatedSection';
import { ToolGrid } from '../../components/tools/ToolGrid';
import { TOOLS } from '../../components/tools/toolsConfig';
import { useToolFavoritesStore } from '../../stores/toolFavoritesStore';
import { spacing, lightTheme, darkTheme } from '../../theme';
import { routeWithParams } from '../../types/routes';

export default function StartScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const router = useRouter();
  const { user, locale } = useAuth();
  const firstName = user?.display_name?.split(' ')[0] ?? null;
  const greeting = getGreeting(locale, firstName);
  const showHelpSubtitle = !greeting.includes('?');

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
    <ScreenScaffold title="Grünerator" backdrop={<SunriseBackground />}>
      <View style={styles.flex}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.welcomeSection}>
            <Text style={[styles.welcomeText, { color: theme.text }]}>{greeting}</Text>
            {showHelpSubtitle && (
              <Text style={[styles.welcomeSubtitle, { color: theme.textSecondary }]}>
                wie kann ich dir helfen?
              </Text>
            )}
          </View>

          <RecentlyCreatedSection theme={theme} />

          {favoriteTools.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Werkzeuge</Text>
              <ToolGrid tools={favoriteTools} />
            </View>
          )}
        </ScrollView>

        <BottomComposerBar
          placeholder="Frage oder Aufgabe…"
          onSend={handleSend}
          onSettings={() => setSettingsVisible(true)}
        />
      </View>
      <ChatSettingsSheet visible={settingsVisible} onDismiss={() => setSettingsVisible(false)} />
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: spacing.medium,
  },
  welcomeSection: {
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
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
