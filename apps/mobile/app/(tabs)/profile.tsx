import { type Ionicons } from '@expo/vector-icons';
import { useAuth } from '@gruenerator/shared/hooks';
import { useAuthStore } from '@gruenerator/shared/stores';
import { router } from 'expo-router';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  useColorScheme,
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import Animated, { runOnJS } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, ChipGroup } from '../../components/common';
import { ProfileHeader, ContentItem } from '../../components/profile';
import { logout } from '../../services/auth';
import { useContentStore } from '../../stores';
import { lightTheme, darkTheme, typography, spacing, colors } from '../../theme';

import type { CombinedContentItem } from '../../services/content';

type SectionId = 'inhalte' | 'anweisungen' | 'einstellungen';

const SECTION_ORDER: SectionId[] = ['inhalte', 'anweisungen', 'einstellungen'];

const PROFILE_SECTIONS = [
  { id: 'inhalte' as const, label: 'Inhalte' },
  { id: 'anweisungen' as const, label: 'Prompt' },
  { id: 'einstellungen' as const, label: 'Einstellungen' },
];

const SECTION_ICONS: Record<SectionId, keyof typeof Ionicons.glyphMap> = {
  inhalte: 'folder-outline',
  anweisungen: 'chatbox-ellipses-outline',
  einstellungen: 'person-outline',
};

function EmptyState({ message }: { message: string }) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  return (
    <View style={styles.emptyState}>
      <Text style={[styles.emptyStateText, { color: theme.textSecondary }]}>{message}</Text>
    </View>
  );
}

function InhalteSection() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const {
    isLoading,
    isRefreshing,
    error,
    fetchContent,
    refreshContent,
    deleteDocument,
    deleteText,
    getCombinedContent,
  } = useContentStore();

  const combinedContent = getCombinedContent();

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  const handleDelete = useCallback(
    async (id: string, itemType: 'document' | 'text') => {
      try {
        if (itemType === 'document') {
          await deleteDocument(id);
        } else {
          await deleteText(id);
        }
      } catch {
        // Error handled in store
      }
    },
    [deleteDocument, deleteText]
  );

  const renderItem = useCallback(
    ({ item }: { item: CombinedContentItem }) => (
      <ContentItem item={item} onDelete={handleDelete} />
    ),
    [handleDelete]
  );

  if (isLoading && combinedContent.length === 0) {
    return (
      <View style={[styles.sectionContent, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary[600]} />
      </View>
    );
  }

  if (error && combinedContent.length === 0) {
    return (
      <View style={[styles.sectionContent, styles.centered]}>
        <Text style={[styles.errorText, { color: theme.text }]}>{error}</Text>
        <Button onPress={fetchContent} variant="outline">
          Erneut versuchen
        </Button>
      </View>
    );
  }

  return (
    <FlatList
      data={combinedContent}
      renderItem={renderItem}
      keyExtractor={(item) => `${item.itemType}-${item.id}`}
      contentContainerStyle={styles.listContent}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={refreshContent}
          tintColor={colors.primary[600]}
        />
      }
      ListEmptyComponent={<EmptyState message="Keine Inhalte vorhanden" />}
    />
  );
}

const MAX_PROMPT_LENGTH = 2000;

function PromptSection() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const { user } = useAuth();
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const [promptText, setPromptText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const initialPromptRef = useRef('');

  useEffect(() => {
    const current = (user?.custom_prompt as string) || '';
    setPromptText(current);
    initialPromptRef.current = current;
  }, [user?.custom_prompt]);

  const hasChanges = promptText !== initialPromptRef.current;

  const handleSave = useCallback(async () => {
    if (!hasChanges || isSaving) return;
    setIsSaving(true);
    try {
      await updateProfile({ custom_prompt: promptText.trim() || null } as any);
      initialPromptRef.current = promptText.trim();
      setPromptText(promptText.trim());
    } catch {
      Alert.alert('Fehler', 'Der Prompt konnte nicht gespeichert werden.');
    } finally {
      setIsSaving(false);
    }
  }, [hasChanges, isSaving, promptText, updateProfile]);

  return (
    <KeyboardAwareScrollView
      style={styles.sectionContent}
      contentContainerStyle={styles.promptContainer}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.promptLabel, { color: theme.textSecondary }]}>
        Persönliche Anweisungen
      </Text>
      <Text style={[styles.promptHint, { color: theme.textSecondary }]}>
        Dieser Text wird bei jeder Textgenerierung als Kontext mitgesendet.
      </Text>
      <TextInput
        style={[
          styles.promptInput,
          {
            color: theme.text,
            backgroundColor: theme.surface,
            borderColor: hasChanges ? colors.primary[500] : theme.cardBorder,
          },
        ]}
        value={promptText}
        onChangeText={setPromptText}
        placeholder="z.B. Ich bin Kreisvorstandsmitglied in Musterstadt und möchte einen formellen Ton..."
        placeholderTextColor={theme.textSecondary}
        multiline
        maxLength={MAX_PROMPT_LENGTH}
        textAlignVertical="top"
      />
      <View style={styles.promptFooter}>
        <Text style={[styles.promptCharCount, { color: theme.textSecondary }]}>
          {promptText.length}/{MAX_PROMPT_LENGTH}
        </Text>
        {hasChanges && (
          <Pressable
            onPress={handleSave}
            disabled={isSaving}
            style={[styles.promptSaveButton, { opacity: isSaving ? 0.6 : 1 }]}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Text style={styles.promptSaveText}>Speichern</Text>
            )}
          </Pressable>
        )}
      </View>
    </KeyboardAwareScrollView>
  );
}

function EinstellungenSection() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const { user } = useAuth();

  return (
    <ScrollView style={styles.sectionContent} contentContainerStyle={styles.scrollContent}>
      <View style={[styles.settingsRow, { borderBottomColor: theme.border }]}>
        <Text style={[styles.settingsLabel, { color: theme.textSecondary }]}>Region</Text>
        <Text style={[styles.settingsValue, { color: theme.text }]}>
          {user?.locale === 'de-AT' ? 'Österreich' : 'Deutschland'}
        </Text>
      </View>

      {user?.igel_modus && (
        <View style={[styles.settingsRow, { borderBottomColor: theme.border }]}>
          <Text style={[styles.settingsLabel, { color: theme.textSecondary }]}>Igel-Modus</Text>
          <Text style={[styles.settingsValue, { color: colors.primary[600] }]}>Aktiv</Text>
        </View>
      )}
    </ScrollView>
  );
}

export default function ProfileScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const { user, isAuthenticated, isLoading, isLoggingOut } = useAuth();
  const [activeSection, setActiveSection] = useState<SectionId>('inhalte');

  const handleLogin = () => {
    router.push('/(auth)/login');
  };

  const handleLogout = async () => {
    await logout();
  };

  const handleSwipe = useCallback(
    (direction: 'left' | 'right') => {
      const currentIndex = SECTION_ORDER.indexOf(activeSection);
      if (direction === 'left' && currentIndex < SECTION_ORDER.length - 1) {
        setActiveSection(SECTION_ORDER[currentIndex + 1]);
      } else if (direction === 'right' && currentIndex > 0) {
        setActiveSection(SECTION_ORDER[currentIndex - 1]);
      }
    },
    [activeSection]
  );

  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .onEnd((event) => {
      if (event.velocityX < -500 || event.translationX < -50) {
        runOnJS(handleSwipe)('left');
      } else if (event.velocityX > 500 || event.translationX > 50) {
        runOnJS(handleSwipe)('right');
      }
    });

  if (isLoading) {
    return (
      <SafeAreaView
        style={[styles.container, styles.centered, { backgroundColor: theme.background }]}
        edges={['top']}
      >
        <ActivityIndicator size="large" color={colors.primary[600]} />
      </SafeAreaView>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.background }]}
        edges={['top']}
      >
        <View style={[styles.centered, { flex: 1, paddingTop: spacing.xxlarge }]}>
          <Text style={[styles.title, { color: theme.text }]}>Profil</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Melde dich an, um deine Inhalte zu verwalten
          </Text>
          <View style={styles.loginButton}>
            <Button onPress={handleLogin}>Anmelden</Button>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <ProfileHeader user={user} compact />

      <View style={styles.chipContainer}>
        <ChipGroup
          options={PROFILE_SECTIONS}
          selected={activeSection}
          onSelect={(value) => setActiveSection(value as SectionId)}
          icons={SECTION_ICONS}
        />
      </View>

      <GestureDetector gesture={swipeGesture}>
        <Animated.View style={styles.contentContainer}>
          {activeSection === 'inhalte' && <InhalteSection />}
          {activeSection === 'anweisungen' && <PromptSection />}
          {activeSection === 'einstellungen' && <EinstellungenSection />}
        </Animated.View>
      </GestureDetector>

      <View style={[styles.logoutSection, { borderTopColor: theme.border }]}>
        <Button variant="outline" onPress={handleLogout} loading={isLoggingOut}>
          Abmelden
        </Button>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.medium,
  },
  title: {
    ...typography.h2,
    marginBottom: spacing.small,
  },
  subtitle: {
    ...typography.body,
    textAlign: 'center',
    marginBottom: spacing.large,
  },
  loginButton: {
    width: '100%',
    maxWidth: 300,
  },
  chipContainer: {
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
  },
  contentContainer: {
    flex: 1,
  },
  sectionContent: {
    flex: 1,
  },
  listContent: {
    paddingVertical: spacing.small,
  },
  scrollContent: {
    paddingVertical: spacing.small,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxlarge,
  },
  emptyStateText: {
    ...typography.body,
  },
  errorText: {
    ...typography.body,
    marginBottom: spacing.medium,
    textAlign: 'center',
  },
  sectionDescription: {
    ...typography.body,
    paddingHorizontal: spacing.medium,
    paddingBottom: spacing.small,
  },
  settingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.medium,
    paddingHorizontal: spacing.medium,
    borderBottomWidth: 1,
  },
  settingsLabel: {
    ...typography.body,
  },
  settingsValue: {
    ...typography.body,
    fontWeight: '500',
  },
  logoutSection: {
    padding: spacing.medium,
    borderTopWidth: 1,
  },
  emptyStateTitle: {
    ...typography.h3,
    marginTop: spacing.medium,
    textAlign: 'center',
  },
  emptyStateSubtitle: {
    ...typography.body,
    marginTop: spacing.small,
    textAlign: 'center',
    paddingHorizontal: spacing.large,
  },
  addButtonContainer: {
    marginTop: spacing.large,
    width: '100%',
    maxWidth: 250,
  },
  addMoreContainer: {
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.medium,
  },
  pickerContainer: {
    marginTop: spacing.medium,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    width: '100%',
    maxWidth: 300,
  },
  pickerItem: {
    paddingVertical: spacing.medium,
    paddingHorizontal: spacing.medium,
    borderBottomWidth: 1,
  },
  pickerItemText: {
    ...typography.body,
  },
  promptContainer: {
    padding: spacing.medium,
    gap: spacing.small,
  },
  promptLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  promptHint: {
    fontSize: 13,
    lineHeight: 18,
  },
  promptInput: {
    minHeight: 160,
    borderWidth: 1,
    borderRadius: 12,
    padding: spacing.medium,
    fontSize: 15,
    lineHeight: 22,
  },
  promptFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  promptCharCount: {
    fontSize: 12,
  },
  promptSaveButton: {
    backgroundColor: colors.primary[600],
    paddingVertical: spacing.xsmall,
    paddingHorizontal: spacing.medium,
    borderRadius: 20,
  },
  promptSaveText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  pickerCancel: {
    paddingVertical: spacing.medium,
    paddingHorizontal: spacing.medium,
    alignItems: 'center',
  },
  pickerCancelText: {
    ...typography.body,
    fontWeight: '500',
  },
});
