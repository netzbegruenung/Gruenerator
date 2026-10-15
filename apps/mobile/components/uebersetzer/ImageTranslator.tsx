import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import {
  type PickedDocument,
  pickImageFromLibrary,
  takePhoto,
  uploadDocumentToScanner,
} from '../../services/documentPicker';
import { borderRadius, colors, spacing, typography } from '../../theme';
import { Button } from '../common/Button';

const ACCEPT_LIST = '.png, .jpg, .jpeg, .gif, .webp';
/** multer's `limits.fileSize` on `/scanner/extract`, checked before the upload. */
const MAX_BYTES = 50 * 1024 * 1024;
const MAX_MB = Math.round(MAX_BYTES / (1024 * 1024));

/**
 * Reads the text off a photo or screenshot and hands it to the Text tab. It
 * translates nothing itself: OCR gets a smudged sign wrong often enough that
 * the text has to land somewhere editable before DeepL bills for it.
 */
export function ImageTranslator({ onText }: { onText: (text: string) => void }) {
  const theme = useTheme();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const read = async (source: () => Promise<PickedDocument | null>) => {
    if (busy) return;
    setError(null);
    let image: PickedDocument | null;
    try {
      image = await source();
    } catch {
      setError('Das Bild konnte nicht gelesen werden.');
      return;
    }
    if (!image) return;
    if (image.size > MAX_BYTES) {
      setError(`„${image.name}" ist größer als ${MAX_MB} MB.`);
      return;
    }
    setBusy(image.name);
    try {
      const result = await uploadDocumentToScanner(image);
      // null means the upload failed and the helper already showed an Alert.
      if (!result) {
        setError('Das Bild konnte nicht gelesen werden.');
        return;
      }
      const text = result.text.trim();
      if (!text) {
        setError('Auf diesem Bild wurde kein Text gefunden.');
        return;
      }
      onText(text);
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.root}>
      <View
        accessibilityState={{ busy: busy !== null }}
        style={[styles.zone, { borderColor: theme.cardBorder }]}
      >
        {busy ? (
          <ActivityIndicator color={theme.textGreen} />
        ) : (
          <Ionicons name="image-outline" size={28} color={theme.textSecondary} />
        )}
        <Text accessibilityLiveRegion="polite" style={[styles.title, { color: theme.text }]}>
          {busy ? `„${busy}" wird gelesen …` : 'Bild auswählen oder aufnehmen'}
        </Text>
        <Text style={[styles.caption, styles.center, { color: theme.textSecondary }]}>
          {ACCEPT_LIST} — bis {MAX_MB} MB
        </Text>
        <View style={styles.buttons}>
          <Button onPress={() => void read(pickImageFromLibrary)} disabled={busy !== null}>
            Bild auswählen
          </Button>
          <Button variant="outline" onPress={() => void read(takePhoto)} disabled={busy !== null}>
            Foto aufnehmen
          </Button>
        </View>
      </View>

      <Text style={[styles.caption, { color: theme.textSecondary }]}>
        Der erkannte Text landet im Ausgangstext-Feld und wird dort übersetzt — dann lässt er sich
        vor dem Übersetzen noch verbessern.
      </Text>

      {error ? (
        <View
          style={[styles.alert, { borderColor: colors.error[500], backgroundColor: theme.surface }]}
        >
          <Text accessibilityRole="alert" style={[styles.body, { color: colors.error[600] }]}>
            {error}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.medium },
  zone: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xsmall,
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.large,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: borderRadius.large,
  },
  title: { ...typography.bodyBold, textAlign: 'center' },
  caption: { ...typography.caption },
  center: { textAlign: 'center' },
  body: { ...typography.body },
  buttons: { width: '100%', maxWidth: 280, gap: spacing.xsmall, marginTop: spacing.xsmall },
  alert: {
    borderWidth: 1,
    borderRadius: borderRadius.medium,
    padding: spacing.small,
  },
});
