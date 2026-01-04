import { useState, useEffect, useCallback } from 'react';
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
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { runOnJS } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { lightTheme, darkTheme, typography, spacing, colors } from '../../theme';
import { useAuth } from '@gruenerator/shared/hooks';
import { logout } from '../../services/auth';
import { Button, ChipGroup } from '../../components/common';
import { ProfileHeader, ContentItem, InstructionCard } from '../../components/profile';
import { useContentStore, useInstructionsStore, INSTRUCTION_TYPES } from '../../stores';
import type { CombinedContentItem } from '../../services/content';

type SectionId = 'inhalte' | 'anweisungen' | 'einstellungen';

const SECTION_ORDER: SectionId[] = ['inhalte', 'anweisungen', 'einstellungen'];

const PROFILE_SECTIONS = [
  { id: 'inhalte' as const, label: 'Inhalte' },
  { id: 'anweisungen' as const, label: 'Anweisungen' },
  { id: 'einstellungen' as const, label: 'Einstellungen' },
];

const SECTION_ICONS: Record<SectionId, keyof typeof Ionicons.glyphMap> = {
  inhalte: 'folder-outline',
  anweisungen: 'settings-outline',
  einstellungen: 'person-outline',
};

function EmptyState({ message }: { message: string }) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  return (
    <View style={styles.emptyState}>
      <Text style={[styles.emptyStateText, { color: theme.textSecondary }]}>
        {message}
      </Text>
    </View>
  );
}

function InhalteSection() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const { isLoading, isRefreshing, error, fetchContent, refreshContent, deleteDocument, deleteText, getCombinedContent } = useContentStore();

  const combinedContent = getCombinedContent();

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  const handleDelete = useCallback(async (id: string, itemType: 'document' | 'text') => {
    try {
      if (itemType === 'document') {
        await deleteDocument(id);
      } else {
        await deleteText(id);
      }
    } catch {
      // Error handled in store
    }
  }, [deleteDocument, deleteText]);

  const renderItem = useCallback(({ item }: { item: CombinedContentItem }) => (
    <ContentItem item={item} onDelete={handleDelete} />
  ), [handleDelete]);

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
        <Button onPress={fetchContent} variant="outline">Erneut versuchen</Button>
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

function AnweisungenSection() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const { instructions, isLoading, isSaving, lastSaved, fetchInstructions, updateInstruction, saveInstructions } = useInstructionsStore();
  const [enabledFields, setEnabledFields] = useState<typeof INSTRUCTION_TYPES[number]['key'][]>([]);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    fetchInstructions();
  }, [fetchInstructions]);

  const instructionsWithContent = INSTRUCTION_TYPES.filter(
    type => instructions[type.key]?.trim().length > 0
  );

  const activeInstructions = INSTRUCTION_TYPES.filter(
    type => instructionsWithContent.some(t => t.key === type.key) ||
            enabledFields.includes(type.key)
  );

  const availableToAdd = INSTRUCTION_TYPES.filter(
    type => !activeInstructions.some(t => t.key === type.key)
  );

  const handleAddInstruction = useCallback((key: typeof INSTRUCTION_TYPES[number]['key']) => {
    setEnabledFields(prev => [...prev, key]);
    setShowPicker(false);
  }, []);

  if (isLoading) {
    return (
      <View style={[styles.sectionContent, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary[600]} />
      </View>
    );
  }

  if (activeInstructions.length === 0) {
    return (
      <View style={[styles.sectionContent, styles.centered]}>
        <Ionicons name="document-text-outline" size={48} color={theme.textSecondary} />
        <Text style={[styles.emptyStateTitle, { color: theme.text }]}>
          Keine Anweisungen gesetzt
        </Text>
        <Text style={[styles.emptyStateSubtitle, { color: theme.textSecondary }]}>
          Erstelle Anweisungen, um dem Grünerator zu sagen, wie er Texte für dich generieren soll.
        </Text>
        <View style={styles.addButtonContainer}>
          <Button onPress={() => setShowPicker(true)}>Anweisung hinzufügen</Button>
        </View>
        {showPicker && (
          <View style={[styles.pickerContainer, { backgroundColor: theme.card, borderColor: theme.border }]}>
            {INSTRUCTION_TYPES.map((type) => (
              <Pressable
                key={type.key}
                style={[styles.pickerItem, { borderBottomColor: theme.border }]}
                onPress={() => handleAddInstruction(type.key)}
              >
                <Text style={[styles.pickerItemText, { color: theme.text }]}>{type.title}</Text>
              </Pressable>
            ))}
            <Pressable
              style={styles.pickerCancel}
              onPress={() => setShowPicker(false)}
            >
              <Text style={[styles.pickerCancelText, { color: theme.textSecondary }]}>Abbrechen</Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  }

  return (
    <ScrollView style={styles.sectionContent} contentContainerStyle={styles.scrollContent}>
      <Text style={[styles.sectionDescription, { color: theme.textSecondary }]}>
        Eigene Anweisungen für jeden Generator-Typ.
      </Text>
      {activeInstructions.map((type) => (
        <InstructionCard
          key={type.key}
          title={type.title}
          value={instructions[type.key]}
          onChange={(value) => updateInstruction(type.key, value)}
          onSave={saveInstructions}
          isSaving={isSaving}
          lastSaved={lastSaved}
        />
      ))}
      {availableToAdd.length > 0 && (
        <View style={styles.addMoreContainer}>
          <Button variant="outline" onPress={() => setShowPicker(true)}>
            Anweisung hinzufügen
          </Button>
          {showPicker && (
            <View style={[styles.pickerContainer, { backgroundColor: theme.card, borderColor: theme.border }]}>
              {availableToAdd.map((type) => (
                <Pressable
                  key={type.key}
                  style={[styles.pickerItem, { borderBottomColor: theme.border }]}
                  onPress={() => handleAddInstruction(type.key)}
                >
                  <Text style={[styles.pickerItemText, { color: theme.text }]}>{type.title}</Text>
                </Pressable>
              ))}
              <Pressable
                style={styles.pickerCancel}
                onPress={() => setShowPicker(false)}
              >
                <Text style={[styles.pickerCancelText, { color: theme.textSecondary }]}>Abbrechen</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
    </ScrollView>
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

  const handleSwipe = useCallback((direction: 'left' | 'right') => {
    const currentIndex = SECTION_ORDER.indexOf(activeSection);
    if (direction === 'left' && currentIndex < SECTION_ORDER.length - 1) {
      setActiveSection(SECTION_ORDER[currentIndex + 1]);
    } else if (direction === 'right' && currentIndex > 0) {
      setActiveSection(SECTION_ORDER[currentIndex - 1]);
    }
  }, [activeSection]);

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
      <SafeAreaView style={[styles.container, styles.centered, { backgroundColor: theme.background }]} edges={['top']}>
        <ActivityIndicator size="large" color={colors.primary[600]} />
      </SafeAreaView>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
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
          {activeSection === 'anweisungen' && <AnweisungenSection />}
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
