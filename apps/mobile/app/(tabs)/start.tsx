import { useAuth } from '@gruenerator/shared/hooks';
import { getGreeting } from '@gruenerator/shared/utils';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, useColorScheme, ScrollView } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';

import { ChatSettingsSheet } from '../../components/chat/ChatSettingsSheet';
import { BottomComposerBar } from '../../components/common/BottomComposerBar';
import { SunriseBackground } from '../../components/common/SunriseBackground';
import { ScreenScaffold } from '../../components/navigation/ScreenScaffold';
import { ALL_TOOLS } from '../../components/tools/toolsConfig';
import { ToolSquareGrid } from '../../components/tools/ToolSquareGrid';
import { useDrawerStore } from '../../hooks/useDrawerStore';
import { useTabSwipe } from '../../hooks/useTabSwipe';
import { useToolFavoritesStore } from '../../stores/toolFavoritesStore';
import { spacing, lightTheme, darkTheme } from '../../theme';
import { SCREEN_EDGE } from '../../theme/layout';
import { route, routeWithParams } from '../../types/routes';

export default function StartScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const router = useRouter();
  const { user, locale } = useAuth();
  const firstName = user?.display_name?.split(' ')[0] ?? null;
  const greeting = getGreeting(locale, firstName);
  const showHelpSubtitle = !greeting.includes('?');

  const [settingsVisible, setSettingsVisible] = useState(false);
  const openDrawer = useDrawerStore((s) => s.openDrawer);
  const favorites = useToolFavoritesStore((s) => s.favorites);
  const favoriteTools = ALL_TOOLS.filter((tool) => favorites.includes(tool.id));

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

  // Swipe left → Arbeiten, swipe right → the drawer. Both live here rather than
  // letting the Drawer handle its own open-swipe: its pan handler claims
  // horizontal drags in both directions, so swipe-left would never reach us.
  const swipe = useTabSwipe({
    onSwipeLeft: () => router.navigate(route('/(tabs)/(arbeiten)')),
    onSwipeRight: openDrawer,
  });

  return (
    <ScreenScaffold title="Grünerator" backdrop={<SunriseBackground />}>
      <GestureDetector gesture={swipe}>
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

            {favoriteTools.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Werkzeuge</Text>
                <ToolSquareGrid tools={favoriteTools} horizontalPadding={SCREEN_EDGE * 2} />
              </View>
            )}
          </ScrollView>

          <BottomComposerBar
            placeholder="Frage oder Aufgabe…"
            onSend={handleSend}
            onSettings={() => setSettingsVisible(true)}
          />
        </View>
      </GestureDetector>
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
    paddingHorizontal: SCREEN_EDGE,
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
    paddingHorizontal: SCREEN_EDGE,
    gap: spacing.small,
  },
  sectionTitle: {
    fontFamily: 'Raleway_700Bold',
    fontSize: 16,
  },
});
