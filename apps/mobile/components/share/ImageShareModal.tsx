/**
 * ImageShareModal
 * Modal for sharing sharepic images with native share, gallery save, and link sharing
 */

import { Ionicons } from '@expo/vector-icons';
import { getShareUrl, useShareStore } from '@gruenerator/shared';
import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ActivityIndicator,
  ScrollView,
  useColorScheme,
  type ViewStyle,
  type TextStyle,
} from 'react-native';

import { saveImageToGallery, shareImage } from '../../services/imageStudio';
import { shareService } from '../../services/share';
import { colors, spacing, borderRadius, typography, lightTheme, darkTheme } from '../../theme';
import { getErrorMessage } from '../../utils/errors';

import { ShareLinkDisplay } from './ShareLinkDisplay';

interface ImageShareModalProps {
  visible: boolean;
  onClose: () => void;
  imageBase64: string;
  shareToken?: string | null;
  defaultTitle?: string;
}

export function ImageShareModal({
  visible,
  onClose,
  imageBase64,
  shareToken: existingShareToken,
  defaultTitle = 'Mein Sharepic',
}: ImageShareModalProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const [savedToGallery, setSavedToGallery] = useState(false);
  const [savingToGallery, setSavingToGallery] = useState(false);
  const [sharingImage, setSharingImage] = useState(false);
  const [creatingLink, setCreatingLink] = useState(false);
  const [linkShareToken, setLinkShareToken] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { createImageShare } = useShareStore();

  const activeShareToken = existingShareToken || linkShareToken;

  useEffect(() => {
    if (visible) {
      setSavedToGallery(false);
      setSavingToGallery(false);
      setSharingImage(false);
      setCreatingLink(false);
      setLinkShareToken(null);
      setLinkError(null);
      setCopied(false);
    }
  }, [visible]);

  const handleDirectShare = async () => {
    if (!imageBase64) return;
    setSharingImage(true);
    try {
      await shareImage(imageBase64);
    } catch (err: unknown) {
      console.error('[ImageShareModal] Direct share error:', getErrorMessage(err));
    }
    setSharingImage(false);
  };

  const handleSaveToGallery = async () => {
    if (!imageBase64) return;
    setSavingToGallery(true);
    const success = await saveImageToGallery(imageBase64);
    setSavingToGallery(false);
    if (success) {
      setSavedToGallery(true);
    }
  };

  const handleCreateLink = async () => {
    setCreatingLink(true);
    setLinkError(null);
    try {
      const share = await createImageShare({
        imageData: imageBase64,
        title: defaultTitle,
        imageType: 'sharepic',
        metadata: { generatedAt: new Date().toISOString() },
      });
      if (share?.shareToken) {
        setLinkShareToken(share.shareToken);
      } else {
        setLinkError('Link konnte nicht erstellt werden.');
      }
    } catch (err: unknown) {
      console.error('[ImageShareModal] Create link error:', getErrorMessage(err));
      setLinkError('Link konnte nicht erstellt werden.');
    }
    setCreatingLink(false);
  };

  const handleCopyLink = async () => {
    if (!activeShareToken) return;
    const url = getShareUrl(activeShareToken);
    const success = await shareService.copyToClipboard(url);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShareLink = async () => {
    if (!activeShareToken) return;
    const url = getShareUrl(activeShareToken);
    await shareService.shareUrl(url, defaultTitle, 'Schau dir dieses Sharepic an!');
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.text }]}>Teilen</Text>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={theme.textSecondary} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {/* Direct Share Section */}
          <View style={[styles.section, { backgroundColor: theme.surface }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Direkt teilen</Text>
            <Pressable
              onPress={handleDirectShare}
              disabled={sharingImage}
              style={({ pressed }) => [
                styles.actionButton,
                { backgroundColor: colors.primary[600], opacity: pressed ? 0.8 : 1 },
              ]}
            >
              {sharingImage ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Ionicons name="share-outline" size={20} color={colors.white} />
              )}
              <Text style={styles.actionButtonText}>Bild teilen</Text>
            </Pressable>
          </View>

          {/* Save to Gallery Section */}
          <View style={[styles.section, { backgroundColor: theme.surface }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Auf Gerät speichern</Text>
            <Pressable
              onPress={handleSaveToGallery}
              disabled={savingToGallery || savedToGallery}
              style={({ pressed }) => [
                styles.actionButton,
                {
                  backgroundColor: savedToGallery ? colors.primary[50] : theme.surface,
                  borderWidth: 1,
                  borderColor: savedToGallery ? colors.primary[600] : colors.grey[300],
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              {savingToGallery ? (
                <ActivityIndicator size="small" color={colors.primary[600]} />
              ) : (
                <Ionicons
                  name={savedToGallery ? 'checkmark-circle' : 'download-outline'}
                  size={20}
                  color={savedToGallery ? colors.primary[600] : theme.text}
                />
              )}
              <Text
                style={[
                  styles.actionButtonTextOutline,
                  { color: savedToGallery ? colors.primary[600] : theme.text },
                ]}
              >
                {savedToGallery ? 'Gespeichert' : 'In Galerie speichern'}
              </Text>
            </Pressable>
          </View>

          {/* Share Link Section */}
          <View style={[styles.section, { backgroundColor: theme.surface }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Link teilen</Text>

            {activeShareToken ? (
              <ShareLinkDisplay
                shareUrl={getShareUrl(activeShareToken)}
                onCopy={handleCopyLink}
                onShare={handleShareLink}
                copied={copied}
              />
            ) : creatingLink ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={colors.primary[600]} />
                <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
                  Link wird erstellt...
                </Text>
              </View>
            ) : (
              <>
                <Pressable
                  onPress={handleCreateLink}
                  style={({ pressed }) => [
                    styles.actionButton,
                    {
                      backgroundColor: theme.surface,
                      borderWidth: 1,
                      borderColor: colors.grey[300],
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                >
                  <Ionicons name="link-outline" size={20} color={theme.text} />
                  <Text style={[styles.actionButtonTextOutline, { color: theme.text }]}>
                    Link erstellen
                  </Text>
                </Pressable>
                {linkError && <Text style={styles.errorText}>{linkError}</Text>}
              </>
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create<{
  container: ViewStyle;
  header: ViewStyle;
  title: TextStyle;
  closeButton: ViewStyle;
  content: ViewStyle;
  section: ViewStyle;
  sectionTitle: TextStyle;
  actionButton: ViewStyle;
  actionButtonText: TextStyle;
  actionButtonTextOutline: TextStyle;
  loadingContainer: ViewStyle;
  loadingText: TextStyle;
  errorText: TextStyle;
}>({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.medium,
    paddingHorizontal: spacing.large,
    borderBottomWidth: 1,
  },
  title: {
    ...typography.h3,
  },
  closeButton: {
    position: 'absolute',
    right: spacing.medium,
    padding: spacing.small,
  },
  content: {
    padding: spacing.large,
    gap: spacing.medium,
  },
  section: {
    borderRadius: borderRadius.large,
    padding: spacing.medium,
    gap: spacing.small,
  },
  sectionTitle: {
    ...typography.label,
    marginBottom: spacing.xxsmall,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.small,
    paddingVertical: spacing.medium,
    borderRadius: borderRadius.medium,
  },
  actionButtonText: {
    ...typography.body,
    color: colors.white,
    fontWeight: '600',
  },
  actionButtonTextOutline: {
    ...typography.body,
    fontWeight: '600',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.small,
    paddingVertical: spacing.medium,
  },
  loadingText: {
    ...typography.body,
  },
  errorText: {
    ...typography.caption,
    color: colors.error[500],
    textAlign: 'center',
    marginTop: spacing.xxsmall,
  },
});
