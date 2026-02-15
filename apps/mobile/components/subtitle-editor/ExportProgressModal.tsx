import { Ionicons } from '@expo/vector-icons';
import * as MediaLibrary from 'expo-media-library';
import { useRef, useEffect, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';

import { shareFile } from '../../services/share';
import { colors, spacing, borderRadius } from '../../theme';
import { EditorModal, type EditorModalRef } from '../common/editor-toolbar/EditorModal';

import type { ExportStatus } from '../../hooks/useSubtitleExport';

interface ExportProgressModalProps {
  visible: boolean;
  status: ExportStatus;
  progress: number;
  videoUri: string | null;
  error: string | null;
  onClose: () => void;
}

export function ExportProgressModal({
  visible,
  status,
  progress,
  videoUri,
  error,
  onClose,
}: ExportProgressModalProps) {
  const modalRef = useRef<EditorModalRef>(null);

  useEffect(() => {
    if (visible) {
      modalRef.current?.open();
    } else {
      modalRef.current?.close();
    }
  }, [visible]);

  const handleSaveToGallery = useCallback(async () => {
    if (!videoUri) return;
    const { status: permStatus } = await MediaLibrary.requestPermissionsAsync();
    if (permStatus !== 'granted') return;
    await MediaLibrary.saveToLibraryAsync(videoUri);
  }, [videoUri]);

  const handleShare = useCallback(async () => {
    if (!videoUri) return;
    await shareFile(videoUri, { mimeType: 'video/mp4' });
  }, [videoUri]);

  const isInProgress = status === 'saving' || status === 'exporting' || status === 'downloading';
  const canDismiss = !isInProgress;

  return (
    <EditorModal
      ref={modalRef}
      onClose={onClose}
      snapPoints={['35%']}
      enablePanDownToClose={canDismiss}
    >
      <View style={styles.container}>
        {isInProgress && (
          <>
            <ActivityIndicator size="large" color={colors.primary[600]} />
            <Text style={styles.title}>
              {status === 'saving'
                ? 'Wird gespeichert...'
                : status === 'downloading'
                  ? 'Wird heruntergeladen...'
                  : 'Video wird exportiert...'}
            </Text>
            <View style={styles.progressBarContainer}>
              <View style={[styles.progressBarFill, { width: `${Math.round(progress)}%` }]} />
            </View>
            <Text style={styles.progressText}>{Math.round(progress)}%</Text>
          </>
        )}

        {status === 'complete' && (
          <>
            <Ionicons name="checkmark-circle" size={48} color={colors.primary[600]} />
            <Text style={styles.title}>Export abgeschlossen</Text>
            <View style={styles.buttonRow}>
              <Pressable style={styles.actionButton} onPress={handleSaveToGallery}>
                <Ionicons name="download-outline" size={20} color={colors.white} />
                <Text style={styles.actionButtonText}>In Galerie speichern</Text>
              </Pressable>
              <Pressable style={[styles.actionButton, styles.shareButton]} onPress={handleShare}>
                <Ionicons name="share-outline" size={20} color={colors.white} />
                <Text style={styles.actionButtonText}>Teilen</Text>
              </Pressable>
            </View>
          </>
        )}

        {status === 'error' && (
          <>
            <Ionicons name="alert-circle" size={48} color={colors.error[500]} />
            <Text style={styles.title}>Export fehlgeschlagen</Text>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>Schließen</Text>
            </Pressable>
          </>
        )}
      </View>
    </EditorModal>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: spacing.medium,
    paddingVertical: spacing.medium,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1a1a1a',
    textAlign: 'center',
  },
  progressBarContainer: {
    width: '100%',
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.primary[600],
    borderRadius: 4,
  },
  progressText: {
    fontSize: 14,
    color: '#666',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.small,
    width: '100%',
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: borderRadius.medium,
    backgroundColor: colors.primary[600],
  },
  shareButton: {
    backgroundColor: colors.primary[700],
  },
  actionButtonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '500',
  },
  errorText: {
    fontSize: 14,
    color: colors.error[500],
    textAlign: 'center',
  },
  closeButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: borderRadius.medium,
    backgroundColor: '#e0e0e0',
  },
  closeButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#333',
  },
});
