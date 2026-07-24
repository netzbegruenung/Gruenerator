import { Ionicons } from '@react-native-vector-icons/ionicons';
import { File, Paths } from 'expo-file-system';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Linking, Alert } from 'react-native';

import { secureStorage } from '../../services/storage';
import { colors, spacing, borderRadius } from '../../theme';

import type { Theme } from '../../theme/colors';
import type { ChatMessageMetadata } from '@gruenerator/chat';

type DocumentCreatedData = NonNullable<ChatMessageMetadata['createdDocument']>;

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://gruenerator.eu/api';

// Native counterpart of web's DocumentCreatedCard: a chat-created document
// with title/subtype and an open button (in-app doc editor; external URLs
// fall back to the system browser). PDFs are downloadable assets, not editor
// documents — they download with the Bearer token and open the share sheet
// (same pattern as ContentDisplay's DOCX export).
export function DocumentCreatedCard({
  document,
  theme,
}: {
  document: DocumentCreatedData;
  theme: Theme;
}) {
  const router = useRouter();
  const isPdf = document.subtype === 'pdf';
  const [downloading, setDownloading] = useState(false);

  const sharePdf = useCallback(async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const token = await secureStorage.getToken();
      // document.url is API-relative (/api/chat-service/…); API_BASE_URL already
      // carries the /api suffix.
      const url = `${API_BASE_URL.replace(/\/api\/?$/, '')}${document.url}`;
      const response = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error(`Download fehlgeschlagen (${response.status})`);

      // documentId for pdf subtypes IS the stored file name (uuid.pdf).
      const fileName = document.documentId?.endsWith('.pdf')
        ? document.documentId
        : `${document.documentId || 'gruenerator'}.pdf`;
      const file = new File(Paths.cache, fileName);
      file.write(new Uint8Array(await response.arrayBuffer()));
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/pdf',
        dialogTitle: document.title,
      });
      file.delete();
    } catch (error) {
      console.error('[DocumentCreatedCard] PDF download error:', error);
      Alert.alert(
        'Fehler',
        'Das PDF konnte nicht geladen werden (Downloads sind 90 Tage verfügbar).'
      );
    } finally {
      setDownloading(false);
    }
  }, [document.documentId, document.title, document.url, downloading]);

  const openDocument = useCallback(() => {
    if (isPdf) {
      void sharePdf();
      return;
    }
    if (document.documentId) {
      // doc-editor reads `id` from useLocalSearchParams.
      router.push({
        pathname: '/(fullscreen)/doc-editor',
        params: { id: document.documentId },
      });
      return;
    }
    if (document.url.startsWith('http')) {
      void Linking.openURL(document.url);
    }
  }, [document.documentId, document.url, isPdf, router, sharePdf]);

  return (
    <View style={[styles.card, { borderColor: theme.cardBorder, backgroundColor: theme.card }]}>
      <Ionicons
        name={isPdf ? 'download-outline' : 'document-text-outline'}
        size={18}
        color={colors.primary[600]}
      />
      <View style={styles.text}>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          {document.title}
        </Text>
        <Text style={[styles.subtype, { color: theme.textSecondary }]}>
          {isPdf ? 'PDF' : document.subtype}
        </Text>
      </View>
      <Pressable onPress={openDocument} style={styles.openButton} disabled={downloading}>
        <Text style={styles.openLabel}>{isPdf ? (downloading ? 'Lädt…' : 'PDF') : 'Öffnen'}</Text>
        <Ionicons name={isPdf ? 'share-outline' : 'arrow-forward'} size={14} color={colors.white} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    marginVertical: spacing.xsmall,
    padding: spacing.small,
    borderRadius: borderRadius.medium,
    borderWidth: 1,
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
  },
  subtype: {
    fontSize: 12,
  },
  openButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.xxsmall,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary[600],
  },
  openLabel: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '600',
  },
});
