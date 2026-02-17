/**
 * ShareModal
 * Modal for sharing videos with QR code and share link
 */

import { Ionicons } from '@expo/vector-icons';
import { useShareStore, getShareUrl } from '@gruenerator/shared';
import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  ActivityIndicator,
  ScrollView,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import { shareService } from '../../services/share';
import { colors, spacing, borderRadius, typography } from '../../theme';
import { getErrorMessage } from '../../utils/errors';
import { Button } from '../common/Button';

import { ShareLinkDisplay } from './ShareLinkDisplay';

interface ShareModalProps {
  visible: boolean;
  onClose: () => void;
  videoUri: string;
  uploadId?: string;
  projectId?: string;
  defaultTitle?: string;
}

type ShareStep = 'input' | 'loading' | 'success' | 'error';

export function ShareModal({
  visible,
  onClose,
  videoUri,
  uploadId,
  projectId,
  defaultTitle = 'Mein Reel',
}: ShareModalProps) {
  const [shareTitle, setShareTitle] = useState(defaultTitle);
  const [step, setStep] = useState<ShareStep>('input');
  const [copied, setCopied] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const {
    createVideoShare,
    currentShare,
    isCreating,
    error: storeError,
    clearCurrentShare,
    clearError,
  } = useShareStore();

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setShareTitle(defaultTitle);
      setStep('input');
      setCopied(false);
      setLocalError(null);
      clearCurrentShare();
      clearError();
    }
  }, [visible, defaultTitle, clearCurrentShare, clearError]);

  // Update step based on store state
  useEffect(() => {
    if (isCreating) {
      setStep('loading');
    } else if (currentShare) {
      setStep('success');
    } else if (storeError) {
      setStep('error');
      setLocalError(storeError);
    }
  }, [isCreating, currentShare, storeError]);

  const handleCreateShare = async () => {
    if (!uploadId) {
      setLocalError('Keine Upload-ID vorhanden');
      setStep('error');
      return;
    }

    try {
      setLocalError(null);
      await createVideoShare({
        projectId: uploadId,
        title: shareTitle || defaultTitle,
      });
    } catch (err: unknown) {
      console.error('[ShareModal] Create share error:', getErrorMessage(err));
    }
  };

  const handleDirectShare = async () => {
    try {
      await shareService.shareFile(videoUri, {
        mimeType: 'video/mp4',
        dialogTitle: 'Reel teilen',
      });
    } catch (err: unknown) {
      console.error('[ShareModal] Direct share error:', getErrorMessage(err));
    }
  };

  const handleCopyLink = async () => {
    if (!currentShare?.shareToken) return;

    const url = getShareUrl(currentShare.shareToken);
    const success = await shareService.copyToClipboard(url);

    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShareLink = async () => {
    if (!currentShare?.shareToken) return;

    const url = getShareUrl(currentShare.shareToken);
    await shareService.shareUrl(url, shareTitle, 'Schau dir dieses Reel an!');
  };

  const handleRetry = () => {
    setStep('input');
    setLocalError(null);
    clearError();
  };

  const renderContent = () => {
    switch (step) {
      case 'input':
        return (
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Titel</Text>
            <TextInput
              style={styles.input}
              value={shareTitle}
              onChangeText={setShareTitle}
              placeholder="Titel eingeben..."
              placeholderTextColor={colors.grey[400]}
              maxLength={200}
            />

            <View style={styles.buttonGroup}>
              <Button onPress={handleCreateShare} variant="primary">
                Link erstellen
              </Button>

              <Button onPress={handleDirectShare} variant="outline">
                <Ionicons name="share-outline" size={18} color={colors.primary[600]} /> Direkt
                teilen
              </Button>
            </View>
          </View>
        );

      case 'loading':
        return (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary[600]} />
            <Text style={styles.loadingText}>Link wird erstellt...</Text>
          </View>
        );

      case 'success':
        if (!currentShare?.shareToken) return null;

        const shareUrl = getShareUrl(currentShare.shareToken);

        return (
          <View style={styles.successContainer}>
            <View style={styles.successHeader}>
              <Ionicons name="checkmark-circle" size={32} color={colors.primary[600]} />
              <Text style={styles.successTitle}>Link erstellt!</Text>
            </View>

            <ShareLinkDisplay
              shareUrl={shareUrl}
              onCopy={handleCopyLink}
              onShare={handleShareLink}
              copied={copied}
            />

            <Button onPress={handleDirectShare} variant="outline" style={styles.directShareButton}>
              <Ionicons name="videocam-outline" size={18} color={colors.primary[600]} /> Video
              direkt teilen
            </Button>
          </View>
        );

      case 'error':
        return (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={48} color={colors.error[500]} />
            <Text style={styles.errorTitle}>Fehler</Text>
            <Text style={styles.errorText}>
              {localError || 'Link konnte nicht erstellt werden.'}
            </Text>
            <Button onPress={handleRetry} variant="outline">
              Erneut versuchen
            </Button>
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView behavior="padding" style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Teilen</Text>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={colors.grey[600]} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {renderContent()}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create<{
  container: ViewStyle;
  header: ViewStyle;
  title: TextStyle;
  closeButton: ViewStyle;
  content: ViewStyle;
  inputContainer: ViewStyle;
  label: TextStyle;
  input: TextStyle;
  buttonGroup: ViewStyle;
  loadingContainer: ViewStyle;
  loadingText: TextStyle;
  successContainer: ViewStyle;
  successHeader: ViewStyle;
  successTitle: TextStyle;
  directShareButton: ViewStyle;
  errorContainer: ViewStyle;
  errorTitle: TextStyle;
  errorText: TextStyle;
}>({
  container: {
    flex: 1,
    backgroundColor: colors.white,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.medium,
    paddingHorizontal: spacing.large,
    borderBottomWidth: 1,
    borderBottomColor: colors.grey[200],
  },
  title: {
    ...typography.h3,
    color: colors.grey[800],
  },
  closeButton: {
    position: 'absolute',
    right: spacing.medium,
    padding: spacing.small,
  },
  content: {
    flexGrow: 1,
    padding: spacing.large,
  },
  inputContainer: {
    gap: spacing.medium,
  },
  label: {
    ...typography.label,
    color: colors.grey[700],
    marginBottom: spacing.xxsmall,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.grey[300],
    borderRadius: borderRadius.medium,
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
    fontSize: 16,
    color: colors.grey[800],
    backgroundColor: colors.white,
  },
  buttonGroup: {
    gap: spacing.medium,
    marginTop: spacing.medium,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxlarge,
    gap: spacing.medium,
  },
  loadingText: {
    ...typography.body,
    color: colors.grey[600],
  },
  successContainer: {
    gap: spacing.medium,
  },
  successHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.small,
    marginBottom: spacing.medium,
  },
  successTitle: {
    ...typography.h3,
    color: colors.grey[800],
  },
  directShareButton: {
    marginTop: spacing.medium,
  },
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxlarge,
    gap: spacing.medium,
  },
  errorTitle: {
    ...typography.h3,
    color: colors.error[500],
  },
  errorText: {
    ...typography.body,
    color: colors.grey[600],
    textAlign: 'center',
    marginBottom: spacing.medium,
  },
});
