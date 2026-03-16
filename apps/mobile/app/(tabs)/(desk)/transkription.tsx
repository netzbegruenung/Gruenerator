import { Ionicons } from '@expo/vector-icons';
import { getGlobalApiClient } from '@gruenerator/shared/api';
import * as DocumentPicker from 'expo-document-picker';
import { useFocusEffect } from 'expo-router';
import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  useColorScheme,
  ActivityIndicator,
  Pressable,
  BackHandler,
  Share,
} from 'react-native';

import { colors, spacing, typography, borderRadius, lightTheme, darkTheme } from '../../../theme';

interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
}

type Phase = 'pick' | 'uploading' | 'transcribing' | 'done' | 'error';

const LANGUAGES = [
  { value: 'de', label: '🇩🇪 Deutsch' },
  { value: 'en', label: '🇬🇧 English' },
  { value: 'fr', label: '🇫🇷 Français' },
] as const;

const AUDIO_MIME_TYPES = [
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/webm',
  'audio/flac',
  'audio/x-m4a',
  'video/mp4',
];

export default function TranskriptionScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const [phase, setPhase] = useState<Phase>('pick');
  const [progress, setProgress] = useState(0);
  const [text, setText] = useState('');
  const [segments, setSegments] = useState<TranscriptionSegment[]>([]);
  const [hasTimestamps, setHasTimestamps] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [diarize, setDiarize] = useState(false);
  const [timestamps, setTimestamps] = useState(false);
  const [language, setLanguage] = useState('de');
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setPhase('pick');
    setProgress(0);
    setText('');
    setSegments([]);
    setHasTimestamps(false);
    setError(null);
    setFileName('');
  }, []);

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

  const handlePick = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: AUDIO_MIME_TYPES,
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const file = result.assets[0];
      setFileName(file.name);

      const controller = new AbortController();
      abortRef.current = controller;

      setPhase('uploading');
      setError(null);

      const formData = new FormData();
      formData.append('audio', {
        uri: file.uri,
        name: file.name,
        type: file.mimeType ?? 'audio/mpeg',
      } as unknown as Blob);

      const params = new URLSearchParams({ language });
      if (diarize) params.set('diarize', 'true');
      if (timestamps) params.set('timestamps', 'true');

      setPhase('transcribing');
      setProgress(100);

      const apiClient = getGlobalApiClient();
      const response = await apiClient.post(`/voice/transcribe?${params}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        signal: controller.signal,
        timeout: 300000,
        onUploadProgress: (e) => {
          if (e.total) setProgress(Math.round((e.loaded / e.total) * 100));
        },
      });

      const data = response.data;
      if (!data.success) throw new Error(data.error ?? 'Transkription fehlgeschlagen');

      setText(data.text ?? '');
      setSegments(data.segments ?? []);
      setHasTimestamps(data.hasTimestamps ?? false);
      setPhase('done');
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Transkription fehlgeschlagen');
      setPhase('error');
    }
  }, [language, diarize, timestamps]);

  const handleShare = useCallback(async () => {
    await Share.share({ message: text });
  }, [text]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={[
        styles.scrollContent,
        phase === 'pick' && styles.scrollContentCentered,
      ]}
      keyboardShouldPersistTaps="handled"
    >
      {phase === 'pick' && (
        <View style={styles.pickContainer}>
          <View style={styles.pickHeader}>
            <Ionicons name="mic" size={48} color={colors.primary[600]} />
            <Text style={[styles.pickTitle, { color: theme.text }]}>Transkription</Text>
            <Text style={[styles.pickSubtitle, { color: theme.textSecondary }]}>
              Audio- und Meeting-Aufnahmen automatisch transkribieren
            </Text>
          </View>

          <View style={styles.optionsRow}>
            <Pressable
              onPress={() => setDiarize((v) => !v)}
              style={[
                styles.optionChip,
                {
                  backgroundColor: diarize ? colors.primary[600] : theme.surface,
                  borderColor: diarize ? colors.primary[600] : theme.border,
                },
              ]}
            >
              <Text style={[styles.optionChipText, { color: diarize ? colors.white : theme.text }]}>
                Sprecher*innen
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setTimestamps((v) => !v)}
              style={[
                styles.optionChip,
                {
                  backgroundColor: timestamps ? colors.primary[600] : theme.surface,
                  borderColor: timestamps ? colors.primary[600] : theme.border,
                },
              ]}
            >
              <Text
                style={[styles.optionChipText, { color: timestamps ? colors.white : theme.text }]}
              >
                Zeitstempel
              </Text>
            </Pressable>
          </View>

          <View style={styles.languageRow}>
            {LANGUAGES.map((lang) => (
              <Pressable
                key={lang.value}
                onPress={() => setLanguage(lang.value)}
                style={[
                  styles.langChip,
                  {
                    backgroundColor: language === lang.value ? colors.primary[600] : theme.surface,
                    borderColor: language === lang.value ? colors.primary[600] : theme.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.langChipText,
                    { color: language === lang.value ? colors.white : theme.text },
                  ]}
                >
                  {lang.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            onPress={handlePick}
            style={({ pressed }) => [
              styles.pickButton,
              { backgroundColor: pressed ? colors.primary[700] : colors.primary[600] },
            ]}
          >
            <Ionicons name="document" size={24} color={colors.white} />
            <View style={styles.pickButtonTextContainer}>
              <Text style={styles.pickButtonTitle}>Audio-Datei auswählen</Text>
              <Text style={styles.pickButtonDesc}>MP3, MP4, WAV, OGG, FLAC, M4A</Text>
            </View>
          </Pressable>
        </View>
      )}

      {(phase === 'uploading' || phase === 'transcribing') && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            {phase === 'uploading' ? `Hochladen... ${progress}%` : 'Wird transkribiert...'}
          </Text>
          {fileName ? (
            <Text style={[styles.fileNameText, { color: theme.textSecondary }]}>{fileName}</Text>
          ) : null}
        </View>
      )}

      {phase === 'done' && (
        <View style={styles.resultContainer}>
          <View style={[styles.resultCard, { backgroundColor: theme.surface }]}>
            <View style={styles.resultHeader}>
              <Ionicons name="document-text" size={20} color={colors.primary[600]} />
              <Text style={[styles.resultTitle, { color: theme.text }]}>Transkription</Text>
            </View>

            {hasTimestamps && segments.length > 0 ? (
              segments.map((seg, i) => (
                <View key={i} style={styles.segmentRow}>
                  <Text style={[styles.segmentTime, { color: colors.primary[600] }]}>
                    {formatTime(seg.start)}
                  </Text>
                  <Text style={[styles.segmentText, { color: theme.text }]}>{seg.text.trim()}</Text>
                </View>
              ))
            ) : (
              <Text style={[styles.resultText, { color: theme.text }]}>{text}</Text>
            )}
          </View>

          <View style={styles.actionRow}>
            <Pressable
              onPress={handleShare}
              style={({ pressed }) => [
                styles.actionButton,
                {
                  backgroundColor: pressed ? theme.surface : theme.card,
                  borderColor: theme.border,
                },
              ]}
            >
              <Ionicons name="share-outline" size={18} color={colors.primary[600]} />
              <Text style={[styles.actionButtonText, { color: theme.text }]}>Teilen</Text>
            </Pressable>
            <Pressable
              onPress={reset}
              style={({ pressed }) => [
                styles.actionButton,
                {
                  backgroundColor: pressed ? theme.surface : theme.card,
                  borderColor: theme.border,
                },
              ]}
            >
              <Ionicons name="refresh" size={18} color={theme.textSecondary} />
              <Text style={[styles.actionButtonText, { color: theme.text }]}>
                Neue Transkription
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {phase === 'error' && (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color={colors.semantic.error} />
          <Text style={[styles.errorText, { color: colors.semantic.error }]}>{error}</Text>
          <Pressable
            onPress={reset}
            style={({ pressed }) => [
              styles.retryButton,
              { backgroundColor: pressed ? colors.primary[700] : colors.primary[600] },
            ]}
          >
            <Text style={styles.retryButtonText}>Erneut versuchen</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: spacing.medium, paddingBottom: spacing.xxlarge },
  scrollContentCentered: { flexGrow: 1, justifyContent: 'center' },
  pickContainer: { alignItems: 'center', gap: spacing.large },
  pickHeader: { alignItems: 'center', gap: spacing.small },
  pickTitle: { ...typography.h2, textAlign: 'center' },
  pickSubtitle: { ...typography.body, textAlign: 'center', maxWidth: 280 },
  optionsRow: { flexDirection: 'row', gap: spacing.small },
  optionChip: {
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
    borderRadius: borderRadius.pill,
    borderWidth: 1,
  },
  optionChipText: { ...typography.bodySmall, fontWeight: '600' },
  languageRow: { flexDirection: 'row', gap: spacing.xsmall },
  langChip: {
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.xsmall,
    borderRadius: borderRadius.pill,
    borderWidth: 1,
  },
  langChipText: { fontSize: 13 },
  pickButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.medium,
    padding: spacing.medium,
    borderRadius: borderRadius.medium,
    width: '100%',
  },
  pickButtonTextContainer: { flex: 1 },
  pickButtonTitle: { ...typography.body, fontWeight: '600', color: colors.white },
  pickButtonDesc: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  loadingContainer: { alignItems: 'center', padding: spacing.xlarge, gap: spacing.medium },
  loadingText: { ...typography.body, textAlign: 'center' },
  fileNameText: { fontSize: 12 },
  resultContainer: { gap: spacing.medium },
  resultCard: { padding: spacing.medium, borderRadius: borderRadius.large, gap: spacing.medium },
  resultHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.small },
  resultTitle: { ...typography.h3 },
  resultText: { ...typography.body, lineHeight: 24 },
  segmentRow: { flexDirection: 'row', gap: spacing.small },
  segmentTime: { fontSize: 12, fontWeight: '600', width: 40, paddingTop: 2 },
  segmentText: { ...typography.body, flex: 1, lineHeight: 22 },
  actionRow: { flexDirection: 'row', gap: spacing.small },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
    borderRadius: borderRadius.medium,
    borderWidth: 1,
  },
  actionButtonText: { ...typography.bodySmall, fontWeight: '500' },
  errorContainer: { alignItems: 'center', padding: spacing.xlarge, gap: spacing.medium },
  errorText: { ...typography.body, textAlign: 'center' },
  retryButton: {
    paddingHorizontal: spacing.large,
    paddingVertical: spacing.small,
    borderRadius: borderRadius.medium,
  },
  retryButtonText: { ...typography.body, fontWeight: '600', color: colors.white },
});
