import { useEffect, useCallback, useState } from 'react';
import {
  View,
  Modal,
  Pressable,
  Text,
  StyleSheet,
  ScrollView,
  useColorScheme,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, lightTheme, darkTheme, typography } from '../../theme';
import { useGeneratorSelectionStore, useContentStore, type AttachedFile } from '../../stores';

let DocumentPicker: typeof import('expo-document-picker') | null = null;
let FileSystem: typeof import('expo-file-system') | null = null;

try {
  DocumentPicker = require('expo-document-picker');
  FileSystem = require('expo-file-system');
} catch (e) {
  console.warn('[ContentPicker] expo-document-picker not available:', e);
}

interface ContentPickerProps {
  visible: boolean;
  onClose: () => void;
}

export function ContentPicker({ visible, onClose }: ContentPickerProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const { documents, texts, isLoading, fetchContent } = useContentStore();
  const selectedDocumentIds = useGeneratorSelectionStore((state) => state.selectedDocumentIds);
  const selectedTextIds = useGeneratorSelectionStore((state) => state.selectedTextIds);
  const attachedFiles = useGeneratorSelectionStore((state) => state.attachedFiles);
  const toggleDocumentSelection = useGeneratorSelectionStore((state) => state.toggleDocumentSelection);
  const toggleTextSelection = useGeneratorSelectionStore((state) => state.toggleTextSelection);
  const addAttachedFile = useGeneratorSelectionStore((state) => state.addAttachedFile);
  const useAutomaticSearch = useGeneratorSelectionStore((state) => state.useAutomaticSearch);
  const toggleAutomaticSearch = useGeneratorSelectionStore((state) => state.toggleAutomaticSearch);

  useEffect(() => {
    if (visible && documents.length === 0 && texts.length === 0) {
      fetchContent();
    }
  }, [visible, documents.length, texts.length, fetchContent]);

  const handleFilePick = useCallback(async () => {
    if (!DocumentPicker || !FileSystem) {
      Alert.alert('Nicht verfügbar', 'Datei-Upload ist in diesem Build nicht verfügbar. Bitte App neu bauen.');
      return;
    }

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets) {
        for (const asset of result.assets) {
          const base64 = await FileSystem.readAsStringAsync(asset.uri, {
            encoding: 'base64',
          });

          const file: AttachedFile = {
            id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: asset.name,
            type: asset.mimeType || 'application/octet-stream',
            size: asset.size || 0,
            uri: asset.uri,
            base64,
          };

          addAttachedFile(file);
        }
      }
    } catch (error) {
      console.error('[ContentPicker] Error picking file:', error);
      Alert.alert('Fehler', 'Datei konnte nicht geladen werden.');
    }
  }, [addAttachedFile]);

  const isDocumentSelected = (id: string) => selectedDocumentIds.includes(id);
  const isTextSelected = (id: string) => selectedTextIds.includes(id);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.modal, { backgroundColor: theme.background }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>Inhalt auswählen</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={24} color={theme.text} />
            </Pressable>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            <Pressable
              onPress={handleFilePick}
              style={[styles.uploadButton, { backgroundColor: theme.buttonBackground }]}
            >
              <Ionicons name="cloud-upload-outline" size={20} color={colors.primary[600]} />
              <Text style={[styles.uploadText, { color: colors.primary[600] }]}>
                Datei hochladen
              </Text>
            </Pressable>

            <Pressable
              onPress={toggleAutomaticSearch}
              style={[
                styles.optionItem,
                { backgroundColor: theme.buttonBackground },
                useAutomaticSearch && styles.optionItemActive,
              ]}
            >
              <View style={styles.optionContent}>
                <Ionicons
                  name="flash-outline"
                  size={20}
                  color={useAutomaticSearch ? colors.white : colors.primary[600]}
                />
                <View style={styles.optionText}>
                  <Text
                    style={[
                      styles.optionTitle,
                      { color: useAutomaticSearch ? colors.white : theme.text },
                    ]}
                  >
                    Automatische Suche
                  </Text>
                  <Text
                    style={[
                      styles.optionDescription,
                      { color: useAutomaticSearch ? colors.primary[100] : theme.textSecondary },
                    ]}
                  >
                    KI wählt relevante Inhalte aus
                  </Text>
                </View>
              </View>
              {useAutomaticSearch && (
                <Ionicons name="checkmark-circle" size={20} color={colors.white} />
              )}
            </Pressable>

            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={colors.primary[600]} />
                <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
                  Lade Inhalte...
                </Text>
              </View>
            ) : (
              <>
                {documents.length > 0 && (
                  <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
                      Dokumente
                    </Text>
                    {documents.map((doc) => (
                      <Pressable
                        key={doc.id}
                        onPress={() => toggleDocumentSelection(doc.id)}
                        style={[
                          styles.contentItem,
                          { backgroundColor: theme.buttonBackground },
                          isDocumentSelected(doc.id) && styles.contentItemSelected,
                        ]}
                      >
                        <View style={styles.contentItemContent}>
                          <Ionicons
                            name="document-outline"
                            size={18}
                            color={isDocumentSelected(doc.id) ? colors.white : theme.text}
                          />
                          <Text
                            style={[
                              styles.contentItemTitle,
                              { color: isDocumentSelected(doc.id) ? colors.white : theme.text },
                            ]}
                            numberOfLines={1}
                          >
                            {doc.title || 'Ohne Titel'}
                          </Text>
                        </View>
                        {isDocumentSelected(doc.id) && (
                          <Ionicons name="checkmark" size={18} color={colors.white} />
                        )}
                      </Pressable>
                    ))}
                  </View>
                )}

                {texts.length > 0 && (
                  <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
                      Gespeicherte Texte
                    </Text>
                    {texts.map((text) => (
                      <Pressable
                        key={text.id}
                        onPress={() => toggleTextSelection(text.id)}
                        style={[
                          styles.contentItem,
                          { backgroundColor: theme.buttonBackground },
                          isTextSelected(text.id) && styles.contentItemSelected,
                        ]}
                      >
                        <View style={styles.contentItemContent}>
                          <Ionicons
                            name="text-outline"
                            size={18}
                            color={isTextSelected(text.id) ? colors.white : theme.text}
                          />
                          <Text
                            style={[
                              styles.contentItemTitle,
                              { color: isTextSelected(text.id) ? colors.white : theme.text },
                            ]}
                            numberOfLines={1}
                          >
                            {text.title || 'Ohne Titel'}
                          </Text>
                        </View>
                        {isTextSelected(text.id) && (
                          <Ionicons name="checkmark" size={18} color={colors.white} />
                        )}
                      </Pressable>
                    ))}
                  </View>
                )}

                {documents.length === 0 && texts.length === 0 && attachedFiles.length === 0 && (
                  <View style={styles.emptyState}>
                    <Ionicons name="folder-open-outline" size={48} color={theme.textSecondary} />
                    <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                      Keine Inhalte vorhanden
                    </Text>
                    <Text style={[styles.emptySubtext, { color: theme.textSecondary }]}>
                      Lade eine Datei hoch oder aktiviere die automatische Suche
                    </Text>
                  </View>
                )}
              </>
            )}
          </ScrollView>

          <View style={styles.footer}>
            <Pressable
              onPress={onClose}
              style={[styles.doneButton, { backgroundColor: colors.primary[600] }]}
            >
              <Text style={styles.doneButtonText}>Fertig</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modal: {
    borderTopLeftRadius: borderRadius.xlarge,
    borderTopRightRadius: borderRadius.xlarge,
    maxHeight: '80%',
    paddingBottom: spacing.xlarge,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.medium,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  title: {
    ...typography.h3,
  },
  content: {
    padding: spacing.medium,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xsmall,
    padding: spacing.medium,
    borderRadius: borderRadius.medium,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.primary[300],
    marginBottom: spacing.medium,
  },
  uploadText: {
    ...typography.body,
    fontWeight: '500',
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.medium,
    borderRadius: borderRadius.medium,
    marginBottom: spacing.medium,
  },
  optionItemActive: {
    backgroundColor: colors.primary[600],
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    flex: 1,
  },
  optionText: {
    flex: 1,
  },
  optionTitle: {
    ...typography.body,
    fontWeight: '500',
  },
  optionDescription: {
    ...typography.caption,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.small,
    padding: spacing.large,
  },
  loadingText: {
    ...typography.body,
  },
  section: {
    marginBottom: spacing.medium,
  },
  sectionTitle: {
    ...typography.caption,
    textTransform: 'uppercase',
    marginBottom: spacing.xsmall,
  },
  contentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.small,
    borderRadius: borderRadius.medium,
    marginBottom: spacing.xsmall,
  },
  contentItemSelected: {
    backgroundColor: colors.primary[600],
  },
  contentItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    flex: 1,
  },
  contentItemTitle: {
    ...typography.body,
    flex: 1,
  },
  emptyState: {
    alignItems: 'center',
    padding: spacing.xlarge,
  },
  emptyText: {
    ...typography.body,
    marginTop: spacing.small,
  },
  emptySubtext: {
    ...typography.caption,
    textAlign: 'center',
    marginTop: spacing.xsmall,
  },
  footer: {
    padding: spacing.medium,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
  },
  doneButton: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.medium,
    borderRadius: borderRadius.buttonPill,
  },
  doneButtonText: {
    ...typography.button,
    color: colors.white,
  },
});
