/**
 * ResultDisplay Component
 * Generated image display with save/share actions and auto-save to gallery
 */

import { useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  useColorScheme,
  Dimensions,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { saveImageToGallery, shareImage, getImageDataUri } from '../../services/imageStudio';
import { Button } from '../common';
import { colors, spacing, borderRadius, lightTheme, darkTheme, typography } from '../../theme';
import { useImageAutoSave } from '../../hooks/useImageAutoSave';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IMAGE_SIZE = SCREEN_WIDTH - spacing.medium * 2;

interface ResultDisplayProps {
  generatedImage: string | null;
  loading: boolean;
  error: string | null;
  onNewGeneration: () => void;
  onBack: () => void;
  onRetry?: () => void;
  onEdit?: () => void;
  showEditButton?: boolean;
}

export function ResultDisplay({
  generatedImage,
  loading,
  error,
  onNewGeneration,
  onBack,
  onRetry,
  onEdit,
  showEditButton = false,
}: ResultDisplayProps) {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

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
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary[600]} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
          Bild wird generiert...
        </Text>
        <Text style={[styles.loadingHint, { color: theme.textSecondary }]}>
          Das kann bis zu 30 Sekunden dauern
        </Text>
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
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Dein Sharepic</Text>
      </View>

      <View style={styles.imageContainer}>
        <Image source={{ uri: imageUri }} style={styles.image} resizeMode="contain" />
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
        {autoSaveStatus === 'saved' && !saved && (
          <View style={[styles.savedBadge, styles.cloudBadge]}>
            <Ionicons name="cloud-done" size={16} color={colors.white} />
            <Text style={styles.savedBadgeText}>In Galerie gesichert</Text>
          </View>
        )}
      </View>

      <View style={styles.actions}>
        <Button
          onPress={handleSave}
          variant={saved ? 'secondary' : 'primary'}
          loading={saving}
          style={styles.actionButton}
        >
          <View style={styles.buttonContent}>
            <Ionicons
              name={saved ? 'checkmark-circle' : 'download-outline'}
              size={18}
              color={saved ? colors.primary[600] : colors.white}
            />
            <Text
              style={[styles.buttonText, { color: saved ? colors.primary[600] : colors.white }]}
            >
              {saved ? 'Gespeichert' : 'Speichern'}
            </Text>
          </View>
        </Button>

        <Button
          onPress={handleShare}
          variant="secondary"
          loading={sharing}
          style={styles.actionButton}
        >
          <View style={styles.buttonContent}>
            <Ionicons name="share-outline" size={18} color={colors.primary[600]} />
            <Text style={[styles.buttonText, { color: colors.primary[600] }]}>Teilen</Text>
          </View>
        </Button>
      </View>

      {showEditButton && onEdit && (
        <View style={styles.editButtonContainer}>
          <Pressable
            onPress={() => router.push(route('/(fullscreen)/webview-editor'))}
            style={styles.editButton}
          >
            <Ionicons name="pencil" size={20} color={colors.primary[600]} />
            <Text style={[styles.editButtonText, { color: colors.primary[600] }]}>Anpassen</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.footerActions}>
        {autoSaveStatus === 'saved' && shareToken && (
          <Pressable
            onPress={() => router.push('/(tabs)/(media)/image-studio/gallery')}
            style={styles.galleryButton}
          >
            <Ionicons name="images-outline" size={20} color={colors.primary[600]} />
            <Text style={[styles.galleryButtonText, { color: colors.primary[600] }]}>
              In Galerie anzeigen
            </Text>
          </Pressable>
        )}
        <Pressable onPress={onNewGeneration} style={styles.newButton}>
          <Ionicons name="add-circle-outline" size={20} color={colors.primary[600]} />
          <Text style={[styles.newButtonText, { color: colors.primary[600] }]}>
            Neues Sharepic erstellen
          </Text>
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
    alignItems: 'center',
    position: 'relative',
  },
  image: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
    borderRadius: borderRadius.large,
  },
  savedBadge: {
    position: 'absolute',
    bottom: spacing.medium + spacing.small,
    right: spacing.medium + spacing.small,
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
  cloudBadge: {
    backgroundColor: colors.primary[600],
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.medium,
    marginTop: spacing.medium,
  },
  actionButton: {
    flex: 1,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xsmall,
  },
  buttonText: {
    ...typography.button,
  },
  footerActions: {
    alignItems: 'center',
    marginTop: spacing.large,
    marginBottom: spacing.medium,
  },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    padding: spacing.medium,
  },
  newButtonText: {
    ...typography.body,
    fontWeight: '500',
  },
  galleryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    padding: spacing.medium,
    backgroundColor: colors.primary[50],
    borderRadius: borderRadius.medium,
    marginBottom: spacing.xsmall,
  },
  galleryButtonText: {
    ...typography.body,
    fontWeight: '600',
  },
  loadingText: {
    ...typography.body,
    marginTop: spacing.medium,
  },
  loadingHint: {
    ...typography.caption,
    marginTop: spacing.xsmall,
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
  editButtonContainer: {
    alignItems: 'center',
    marginTop: spacing.medium,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    paddingVertical: spacing.small,
    paddingHorizontal: spacing.medium,
    borderRadius: borderRadius.medium,
    borderWidth: 1,
    borderColor: colors.primary[600],
  },
  editButtonText: {
    ...typography.body,
    fontWeight: '600',
  },
});
