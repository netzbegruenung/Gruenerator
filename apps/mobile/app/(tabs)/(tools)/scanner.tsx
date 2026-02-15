import { Ionicons } from '@expo/vector-icons';
import { getGlobalApiClient } from '@gruenerator/shared/api';
import { useGeneratedTextStore } from '@gruenerator/shared/stores';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from 'expo-router';
import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  useColorScheme,
  ActivityIndicator,
  Pressable,
  Alert,
  BackHandler,
} from 'react-native';

import { ContentDisplay } from '../../../components/content';
import { colors, spacing, typography, borderRadius, lightTheme, darkTheme } from '../../../theme';

const COMPONENT_NAME = 'scanner-mobile';

const ALLOWED_DOC_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

const TRANSFORM_PRESETS = [
  { id: 'ergebnisprotokoll', label: 'Ergebnisprotokoll', icon: 'document-text' as const },
  { id: 'notizen', label: 'Notizen', icon: 'create' as const },
  { id: 'korrektur', label: 'Text korrigieren', icon: 'checkmark-circle' as const },
] as const;

const TRANSFORM_PROMPTS: Record<string, string> = {
  ergebnisprotokoll:
    'Erstelle aus dem folgenden Text ein strukturiertes Ergebnisprotokoll. Verwende Überschriften, Aufzählungspunkte und fasse die wesentlichen Ergebnisse zusammen.',
  notizen:
    'Fasse den folgenden Text als übersichtliche Notizen zusammen. Verwende Stichpunkte und hebe wichtige Punkte hervor.',
  korrektur:
    'Korrigiere den folgenden Text. Behebe Rechtschreib- und Grammatikfehler, verbessere den Ausdruck, aber bewahre den ursprünglichen Inhalt und Stil.',
};

type Phase = 'pick' | 'extracting' | 'extracted' | 'transforming' | 'result';

interface FileInfo {
  name: string;
  size: number;
  mimeType: string;
}

export default function ScannerScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const [extractedText, setExtractedText] = useState('');
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [pageCount, setPageCount] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [previewExpanded, setPreviewExpanded] = useState(false);

  const content = useGeneratedTextStore((state) => state.generatedTexts[COMPONENT_NAME] || '');
  const setTextWithHistory = useGeneratedTextStore((state) => state.setTextWithHistory);
  const clearGeneratedText = useGeneratedTextStore((state) => state.clearGeneratedText);

  const hasResult = content.trim().length > 0;

  const [phase, setPhase] = useState<Phase>(() => (content.trim().length > 0 ? 'result' : 'pick'));

  const reset = useCallback(() => {
    setPhase('pick');
    setExtractedText('');
    setFileInfo(null);
    setPageCount(0);
    setError(null);
    setPreviewExpanded(false);
    clearGeneratedText(COMPONENT_NAME);
  }, [clearGeneratedText]);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (phase !== 'pick') {
          reset();
          return true;
        }
        return false;
      };
      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [phase, reset])
  );

  const uploadAndExtract = useCallback(async (uri: string, name: string, mimeType: string) => {
    setPhase('extracting');
    setError(null);

    try {
      const apiClient = getGlobalApiClient();
      const formData = new FormData();

      formData.append('file', {
        uri,
        name,
        type: mimeType,
      } as unknown as Blob);

      const response = await apiClient.post('/scanner/extract', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      });

      if (response.data.success) {
        setExtractedText(response.data.text);
        setPageCount(response.data.pageCount || 0);
        setFileInfo({
          name: response.data.fileInfo?.originalname || name,
          size: response.data.fileInfo?.size || 0,
          mimeType: response.data.fileInfo?.mimetype || mimeType,
        });
        setPhase('extracted');
      } else {
        throw new Error('Textextraktion fehlgeschlagen');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Fehler bei der Textextraktion';
      setError(message);
      setPhase('pick');
    }
  }, []);

  const handlePickDocument = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ALLOWED_DOC_TYPES,
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        await uploadAndExtract(asset.uri, asset.name, asset.mimeType || 'application/octet-stream');
      }
    } catch (err) {
      console.error('[Scanner] DocumentPicker error:', err);
      setError('Fehler beim Auswählen der Datei');
    }
  }, [uploadAndExtract]);

  const handlePickCamera = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Berechtigung', 'Kamerazugriff wird benötigt um Dokumente zu scannen.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.9,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const name = asset.fileName || `scan_${Date.now()}.jpg`;
        await uploadAndExtract(asset.uri, name, asset.mimeType || 'image/jpeg');
      }
    } catch (err) {
      console.error('[Scanner] Camera error:', err);
      setError('Fehler beim Aufnehmen des Fotos');
    }
  }, [uploadAndExtract]);

  const handlePickGallery = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const name = asset.fileName || `image_${Date.now()}.jpg`;
        await uploadAndExtract(asset.uri, name, asset.mimeType || 'image/jpeg');
      }
    } catch (err) {
      console.error('[Scanner] Gallery error:', err);
      setError('Fehler beim Auswählen des Bildes');
    }
  }, [uploadAndExtract]);

  const handleTransform = useCallback(
    async (presetId: string) => {
      if (!extractedText) return;

      setPhase('transforming');
      setError(null);

      try {
        const apiClient = getGlobalApiClient();
        const response = await apiClient.post('/claude_text_adjustment', {
          originalText: extractedText,
          modification: TRANSFORM_PROMPTS[presetId],
          fullText: true,
        });

        const transformed = response.data?.result || response.data?.text || '';
        if (transformed) {
          setTextWithHistory(COMPONENT_NAME, transformed);
          setPhase('result');
        } else {
          throw new Error('Keine Antwort erhalten');
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Fehler bei der Textverarbeitung';
        setError(message);
        setPhase('extracted');
      }
    },
    [extractedText, setTextWithHistory]
  );

  if (hasResult && phase === 'result') {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <ContentDisplay componentName={COMPONENT_NAME} onNewGeneration={reset} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={[
        styles.scrollContent,
        phase === 'pick' && styles.scrollContentCentered,
      ]}
      keyboardShouldPersistTaps="handled"
    >
      {error && (
        <View style={[styles.errorBox, { backgroundColor: colors.error[500] + '15' }]}>
          <Ionicons name="alert-circle" size={20} color={colors.error[500]} />
          <Text style={[styles.errorText, { color: colors.error[500] }]}>{error}</Text>
        </View>
      )}

      {phase === 'pick' && (
        <View style={styles.pickContainer}>
          <View style={styles.pickHeader}>
            <Ionicons name="scan" size={48} color={colors.primary[600]} />
            <Text style={[styles.pickTitle, { color: theme.text }]}>Dokument scannen</Text>
            <Text style={[styles.pickSubtitle, { color: theme.textSecondary }]}>
              Text aus Dokumenten, Bildern oder Fotos extrahieren
            </Text>
          </View>

          <View style={styles.pickButtons}>
            <Pressable
              onPress={handlePickDocument}
              style={({ pressed }) => [
                styles.pickButton,
                { backgroundColor: pressed ? colors.primary[700] : colors.primary[600] },
              ]}
            >
              <Ionicons name="document" size={24} color={colors.white} />
              <View style={styles.pickButtonTextContainer}>
                <Text style={styles.pickButtonTitle}>Datei auswählen</Text>
                <Text style={styles.pickButtonDesc}>PDF, DOCX, PPTX, Bilder</Text>
              </View>
            </Pressable>

            <Pressable
              onPress={handlePickCamera}
              style={({ pressed }) => [
                styles.pickButton,
                styles.pickButtonOutline,
                {
                  borderColor: colors.primary[600],
                  backgroundColor: pressed ? colors.primary[50] : 'transparent',
                },
              ]}
            >
              <Ionicons name="camera" size={24} color={colors.primary[600]} />
              <View style={styles.pickButtonTextContainer}>
                <Text style={[styles.pickButtonTitle, { color: colors.primary[600] }]}>Kamera</Text>
                <Text style={[styles.pickButtonDesc, { color: theme.textSecondary }]}>
                  Dokument abfotografieren
                </Text>
              </View>
            </Pressable>

            <Pressable
              onPress={handlePickGallery}
              style={({ pressed }) => [
                styles.pickButton,
                styles.pickButtonOutline,
                {
                  borderColor: colors.primary[600],
                  backgroundColor: pressed ? colors.primary[50] : 'transparent',
                },
              ]}
            >
              <Ionicons name="images" size={24} color={colors.primary[600]} />
              <View style={styles.pickButtonTextContainer}>
                <Text style={[styles.pickButtonTitle, { color: colors.primary[600] }]}>
                  Galerie
                </Text>
                <Text style={[styles.pickButtonDesc, { color: theme.textSecondary }]}>
                  Bild aus der Galerie wählen
                </Text>
              </View>
            </Pressable>
          </View>

          <Text style={[styles.pickHint, { color: theme.textSecondary }]}>
            Max. 50 MB · PDF, PNG, JPG, DOCX, PPTX
          </Text>
        </View>
      )}

      {phase === 'extracting' && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            Text wird extrahiert...
          </Text>
        </View>
      )}

      {phase === 'extracted' && (
        <View style={styles.extractedContainer}>
          {fileInfo && (
            <View style={[styles.fileInfoCard, { backgroundColor: theme.surface }]}>
              <Ionicons name="document-text" size={24} color={colors.primary[600]} />
              <View style={styles.fileInfoText}>
                <Text style={[styles.fileName, { color: theme.text }]} numberOfLines={1}>
                  {fileInfo.name}
                </Text>
                <Text style={[styles.fileDetails, { color: theme.textSecondary }]}>
                  {pageCount > 0 ? `${pageCount} Seiten · ` : ''}
                  {formatFileSize(fileInfo.size)}
                </Text>
              </View>
            </View>
          )}

          <Pressable
            onPress={() => setPreviewExpanded((v) => !v)}
            style={({ pressed }) => [
              styles.previewCard,
              { backgroundColor: pressed ? theme.border : theme.surface },
            ]}
          >
            <View style={styles.previewHeader}>
              <Text style={[styles.previewLabel, { color: theme.textSecondary }]}>
                Extrahierter Text
              </Text>
              <Ionicons
                name={previewExpanded ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={theme.textSecondary}
              />
            </View>
            <Text
              style={[styles.previewText, { color: theme.text }]}
              numberOfLines={previewExpanded ? undefined : 8}
            >
              {extractedText}
            </Text>
            <Text style={[styles.charCount, { color: theme.textSecondary }]}>
              {extractedText.length} Zeichen
            </Text>
          </Pressable>

          <Text style={[styles.transformTitle, { color: theme.text }]}>Text verarbeiten</Text>

          <View style={styles.transformButtons}>
            {TRANSFORM_PRESETS.map((preset) => (
              <Pressable
                key={preset.id}
                onPress={() => handleTransform(preset.id)}
                style={({ pressed }) => [
                  styles.transformButton,
                  {
                    backgroundColor: pressed ? theme.surface : theme.card,
                    borderColor: theme.border,
                  },
                ]}
              >
                <Ionicons name={preset.icon} size={20} color={colors.primary[600]} />
                <Text style={[styles.transformButtonText, { color: theme.text }]}>
                  {preset.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable onPress={reset} style={styles.resetButton}>
            <Ionicons name="arrow-back" size={18} color={theme.textSecondary} />
            <Text style={[styles.resetButtonText, { color: theme.textSecondary }]}>
              Anderes Dokument wählen
            </Text>
          </Pressable>
        </View>
      )}

      {phase === 'transforming' && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            Text wird verarbeitet...
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i] || 'MB'}`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.medium,
    paddingBottom: spacing.xxlarge,
  },
  scrollContentCentered: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    padding: spacing.medium,
    borderRadius: borderRadius.medium,
    marginBottom: spacing.medium,
  },
  errorText: {
    ...typography.body,
    flex: 1,
  },
  pickContainer: {
    alignItems: 'center',
    gap: spacing.large,
  },
  pickHeader: {
    alignItems: 'center',
    gap: spacing.small,
  },
  pickTitle: {
    ...typography.h2,
    textAlign: 'center',
  },
  pickSubtitle: {
    ...typography.body,
    textAlign: 'center',
    maxWidth: 280,
  },
  pickButtons: {
    width: '100%',
    gap: spacing.small,
  },
  pickButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.medium,
    padding: spacing.medium,
    borderRadius: borderRadius.medium,
    backgroundColor: colors.primary[600],
  },
  pickButtonOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
  },
  pickButtonTextContainer: {
    flex: 1,
  },
  pickButtonTitle: {
    ...typography.body,
    fontWeight: '600',
    color: colors.white,
  },
  pickButtonDesc: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  pickHint: {
    fontSize: 12,
    textAlign: 'center',
  },
  loadingContainer: {
    alignItems: 'center',
    padding: spacing.xlarge,
    gap: spacing.medium,
  },
  loadingText: {
    ...typography.body,
    textAlign: 'center',
  },
  extractedContainer: {
    gap: spacing.medium,
  },
  fileInfoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.medium,
    padding: spacing.medium,
    borderRadius: borderRadius.medium,
  },
  fileInfoText: {
    flex: 1,
  },
  fileName: {
    ...typography.body,
    fontWeight: '600',
  },
  fileDetails: {
    fontSize: 12,
    marginTop: 2,
  },
  previewCard: {
    padding: spacing.medium,
    borderRadius: borderRadius.medium,
    gap: spacing.small,
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  previewText: {
    ...typography.body,
    lineHeight: 22,
  },
  charCount: {
    fontSize: 12,
    textAlign: 'right',
  },
  transformTitle: {
    ...typography.h3,
    marginTop: spacing.small,
  },
  transformButtons: {
    gap: spacing.small,
  },
  transformButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.medium,
    padding: spacing.medium,
    borderRadius: borderRadius.medium,
    borderWidth: 1,
  },
  transformButtonText: {
    ...typography.body,
    fontWeight: '500',
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xsmall,
    paddingVertical: spacing.small,
  },
  resetButtonText: {
    fontSize: 14,
  },
});
