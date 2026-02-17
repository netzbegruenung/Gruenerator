/**
 * ResultDisplay Component
 * Generated image display with save/share actions and auto-save to gallery
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  useColorScheme,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useImageAutoSave } from '../../hooks/useImageAutoSave';
import { saveImageToGallery, shareImage, getImageDataUri } from '../../services/imageStudio';
import { colors, spacing, borderRadius, lightTheme, darkTheme, typography } from '../../theme';
import { Button, PulseLoader } from '../common';

interface ResultDisplayProps {
  generatedImage: string | null;
  loading: boolean;
  error: string | null;
  onNewGeneration: () => void;
  onBack: () => void;
  onRetry?: () => void;
}

export function ResultDisplay({
  generatedImage,
  loading,
  error,
  onNewGeneration,
  onBack,
  onRetry,
}: ResultDisplayProps) {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const insets = useSafeAreaInsets();

  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);

  // Auto-save to gallery database
  const { status: autoSaveStatus, shareToken } = useImageAutoSave();

  const handleSave = async () => {
    if (!generatedImage) return;

    setSaving(true);
    const success = await saveImageToGallery(generatedImage);
    setSaving(false);

    if (success) {
      setSaved(true);
    }
  };

  const handleShare = async () => {
    if (!generatedImage) return;

    setSharing(true);
    await shareImage(generatedImage);
    setSharing(false);
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <PulseLoader
          title="Bild wird generiert"
          subtitle="Das kann bis zu 30 Sekunden dauern"
          icon="color-wand"
        />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.error[500]} />
        <Text style={[styles.errorTitle, { color: theme.text }]}>Generierung fehlgeschlagen</Text>
        <Text style={[styles.errorText, { color: theme.textSecondary }]}>{error}</Text>
        {onRetry && (
          <Button onPress={onRetry} variant="primary" style={styles.retryButton}>
            Erneut versuchen
          </Button>
        )}
        <Pressable onPress={onBack} style={styles.backLink}>
          <Text style={[styles.backLinkText, { color: colors.primary[600] }]}>
            Zurück bearbeiten
          </Text>
        </Pressable>
      </View>
    );
  }

  if (!generatedImage) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={[styles.emptyText, { color: theme.textSecondary }]}>Kein Bild generiert</Text>
        <Pressable onPress={onBack} style={styles.backLink}>
          <Text style={[styles.backLinkText, { color: colors.primary[600] }]}>Zurück</Text>
        </Pressable>
      </View>
    );
  }

  const imageUri = getImageDataUri(generatedImage);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + spacing.medium }]}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Dein Sharepic</Text>
      </View>

      <View style={styles.imageContainer}>
        <Image source={{ uri: imageUri }} style={styles.image} resizeMode="cover" />
        {/* Device gallery saved badge */}
        {saved && (
          <View style={styles.savedBadge}>
            <Ionicons name="checkmark-circle" size={16} color={colors.white} />
            <Text style={styles.savedBadgeText}>Gespeichert</Text>
          </View>
        )}
        {/* Auto-save to database status */}
        {autoSaveStatus === 'saving' && (
          <View style={[styles.savedBadge, styles.savingBadge]}>
            <ActivityIndicator size="small" color={colors.white} />
            <Text style={styles.savedBadgeText}>Wird synchronisiert...</Text>
          </View>
        )}
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={({ pressed }) => [
            styles.iconButton,
            {
              backgroundColor: saved ? theme.surface : colors.primary[600],
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          {saving ? (
            <ActivityIndicator size="small" color={saved ? colors.primary[600] : colors.white} />
          ) : (
            <Ionicons
              name={saved ? 'checkmark-circle' : 'arrow-down-circle-outline'}
              size={22}
              color={saved ? colors.primary[600] : colors.white}
            />
          )}
        </Pressable>

        <Pressable
          onPress={handleShare}
          disabled={sharing}
          style={({ pressed }) => [
            styles.iconButton,
            { backgroundColor: theme.surface, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          {sharing ? (
            <ActivityIndicator size="small" color={colors.primary[600]} />
          ) : (
            <Ionicons name="share-social-outline" size={22} color={colors.primary[600]} />
          )}
        </Pressable>

        {autoSaveStatus === 'saved' && shareToken && (
          <Pressable
            onPress={() => router.push('/(tabs)/(media)/image-studio/gallery')}
            style={({ pressed }) => [
              styles.iconButton,
              { backgroundColor: theme.surface, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Ionicons name="images-outline" size={22} color={colors.primary[600]} />
          </Pressable>
        )}

        <Pressable
          onPress={onNewGeneration}
          style={({ pressed }) => [
            styles.iconButton,
            { backgroundColor: theme.surface, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Ionicons name="add" size={22} color={colors.primary[600]} />
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.medium,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.large,
  },
  header: {
    marginBottom: spacing.small,
  },
  title: {
    ...typography.h3,
  },
  imageContainer: {
    position: 'relative',
  },
  image: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: borderRadius.medium,
  },
  savedBadge: {
    position: 'absolute',
    bottom: spacing.medium,
    right: spacing.medium,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: spacing.xxsmall,
    paddingHorizontal: spacing.small,
    borderRadius: borderRadius.full,
  },
  savedBadgeText: {
    ...typography.caption,
    color: colors.white,
  },
  savingBadge: {
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.large,
    marginTop: spacing.large,
    marginBottom: spacing.medium,
  },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  errorTitle: {
    ...typography.h4,
    marginTop: spacing.medium,
    marginBottom: spacing.xsmall,
  },
  errorText: {
    ...typography.body,
    textAlign: 'center',
    marginBottom: spacing.large,
  },
  retryButton: {
    marginBottom: spacing.medium,
  },
  backLink: {
    padding: spacing.small,
  },
  backLinkText: {
    ...typography.body,
  },
  emptyText: {
    ...typography.body,
    textAlign: 'center',
  },
});
