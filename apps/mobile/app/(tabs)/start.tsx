import { useAuth } from '@gruenerator/shared/hooks';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, useColorScheme, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChatSettingsSheet } from '../../components/chat/ChatSettingsSheet';
import { ComposerCard } from '../../components/common';
import { ProfileMenu } from '../../components/navigation/ProfileMenu';
import { SidebarMenuButton } from '../../components/navigation/SidebarMenuButton';
import { RecentlyCreatedSection } from '../../components/start/RecentlyCreatedSection';
import { ToolGrid } from '../../components/tools/ToolGrid';
import { TOOLS } from '../../components/tools/toolsConfig';
import { useToolFavoritesStore } from '../../stores/toolFavoritesStore';
import { colors, spacing, lightTheme, darkTheme } from '../../theme';
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
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient
        colors={
          colorScheme === 'dark'
            ? [colors.grey[950], colors.grey[950]]
            : [colors.white, 'rgba(95, 133, 117, 0.05)']
        }
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      />
      <View style={styles.header}>
        <View style={styles.headerSide}>
          <SidebarMenuButton color={theme.text} size={24} />
        </View>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Grünerator</Text>
        <View style={[styles.headerSide, styles.headerSideRight]}>
          <ProfileMenu />
        </View>
      </View>

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

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Werkzeuge</Text>
          {favoriteTools.length > 0 ? (
            <ToolGrid tools={favoriteTools} />
          ) : (
            <Text style={[styles.werkzeugeHint, { color: theme.textSecondary }]}>
              Markiere im Tools-Tab deine Lieblingswerkzeuge – halte ein Werkzeug gedrückt, um es
              hier anzuheften.
            </Text>
          )}
        </View>
      </ScrollView>
      <ChatSettingsSheet visible={settingsVisible} onDismiss={() => setSettingsVisible(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
  },
  headerSide: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerSideRight: {
    justifyContent: 'flex-end',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
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
    fontSize: 28,
    fontWeight: '700',
  },
  welcomeSubtitle: {
    fontSize: 28,
    fontWeight: '700',
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
    fontSize: 16,
    fontWeight: '700',
  },
  werkzeugeHint: {
    fontSize: 13,
    lineHeight: 18,
  },
});
