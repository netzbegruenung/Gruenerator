import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Linking } from 'react-native';

import { colors, spacing, borderRadius } from '../../theme';

import type { Theme } from '../../theme/colors';
import type { ChatMessageMetadata } from '@gruenerator/chat';

type DocumentCreatedData = NonNullable<ChatMessageMetadata['createdDocument']>;

// Native counterpart of web's DocumentCreatedCard: a chat-created document
// with title/subtype and an open button (in-app doc editor; external URLs
// fall back to the system browser).
export function DocumentCreatedCard({
  document,
  theme,
}: {
  document: DocumentCreatedData;
  theme: Theme;
}) {
  const router = useRouter();

  const openDocument = useCallback(() => {
    if (document.documentId) {
      router.push({
        pathname: '/(fullscreen)/doc-editor',
        params: { documentId: document.documentId },
      });
      return;
    }
    if (document.url.startsWith('http')) {
      void Linking.openURL(document.url);
    }
  }, [document.documentId, document.url, router]);

  return (
    <View style={[styles.card, { borderColor: theme.cardBorder, backgroundColor: theme.card }]}>
      <Ionicons name="document-text-outline" size={18} color={colors.primary[600]} />
      <View style={styles.text}>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          {document.title}
        </Text>
        <Text style={[styles.subtype, { color: theme.textSecondary }]}>{document.subtype}</Text>
      </View>
      <Pressable onPress={openDocument} style={styles.openButton}>
        <Text style={styles.openLabel}>Öffnen</Text>
        <Ionicons name="arrow-forward" size={14} color={colors.white} />
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
